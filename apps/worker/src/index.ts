import path from 'path'
import dotenv from 'dotenv'
import amqp from 'amqplib'
import express from 'express'
import client from 'prom-client'
import { Pool } from 'pg'
import { SendJobPayload, QUEUE } from '@bms/shared'
import { sendWithProvider, resolveProvider } from './mailProvider'

dotenv.config({ path: path.resolve(__dirname, '../../../.env') })
dotenv.config({ path: path.resolve(__dirname, '../../../.env.example') })

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://bms:bms_secret@localhost:5432/bulkmail',
})

const rabbitUrl = process.env.RABBITMQ_URL || 'amqp://bms:bms_secret@localhost:5672'
const queueSend = process.env.RABBITMQ_QUEUE_SEND || QUEUE.SEND
const metricsPort = Number(process.env.PORT || process.env.WORKER_METRICS_PORT || 8081)

const sentCounter = new client.Counter({
  name: 'bms_worker_sent_total',
  help: 'Successfully sent messages',
  labelNames: ['provider'] as const,
})
const failCounter = new client.Counter({
  name: 'bms_worker_failed_total',
  help: 'Failed send attempts',
  labelNames: ['provider'] as const,
})

async function isSuppressed(email: string): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT 1 FROM recipients
     WHERE email=$1 AND (unsubscribed_at IS NOT NULL OR suppressed_at IS NOT NULL)
     LIMIT 1`,
    [email.toLowerCase()],
  )
  return rows.length > 0
}

async function handleSend(job: SendJobPayload) {
  const provider = resolveProvider()
  // 送信直前に再チェック（配信停止・Complaint 後の再送防止）
  if (await isSuppressed(job.toEmail)) {
    await pool.query(
      `UPDATE messages SET status='suppressed', error='suppressed before send' WHERE id=$1`,
      [job.messageId],
    )
    return
  }

  await pool.query(`UPDATE messages SET status='sending' WHERE id=$1`, [job.messageId])

  const info = await sendWithProvider(job)

  await pool.query(
    `UPDATE messages
     SET status='sent', sent_at=now(), delivered_at=now(), provider_msg_id=$2
     WHERE id=$1`,
    [job.messageId, info.messageId || null],
  )
  await pool.query(
    `INSERT INTO delivery_events (message_id, campaign_id, event_type, payload)
     VALUES ($1,$2,'sent',$3)`,
    [
      job.messageId,
      job.campaignId,
      JSON.stringify({ providerMessageId: info.messageId, provider }),
    ],
  )
  sentCounter.inc({ provider })
}

async function startMetricsServer() {
  client.collectDefaultMetrics()
  const app = express()
  app.get('/health', (_req, res) =>
    res.json({ ok: true, service: 'bulkmail-worker', provider: resolveProvider() }),
  )
  app.get('/metrics', async (_req, res) => {
    res.set('Content-Type', client.register.contentType)
    res.end(await client.register.metrics())
  })
  app.listen(metricsPort, () => console.log(`[worker] metrics on :${metricsPort}`))
}

async function main() {
  await startMetricsServer()
  const conn = await amqp.connect(rabbitUrl)
  const ch = await conn.createChannel()
  await ch.assertQueue(queueSend, { durable: true })
  ch.prefetch(10)
  console.log(`[worker] consuming ${queueSend} provider=${resolveProvider()}`)

  ch.consume(queueSend, async (msg) => {
    if (!msg) return
    try {
      const job = JSON.parse(msg.content.toString()) as SendJobPayload
      await handleSend(job)
      ch.ack(msg)
    } catch (e) {
      failCounter.inc({ provider: resolveProvider() })
      console.error('[worker] send failed', e)
      try {
        const job = JSON.parse(msg.content.toString()) as SendJobPayload
        await pool.query(`UPDATE messages SET status='failed', error=$2 WHERE id=$1`, [
          job.messageId,
          e instanceof Error ? e.message : String(e),
        ])
      } catch {
        // ignore
      }
      ch.nack(msg, false, false)
    }
  })
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
