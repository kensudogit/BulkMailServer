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
const metricsPort = Number(process.env.WORKER_METRICS_PORT || 8081)

function resolveQueueBackend(): 'rabbitmq' | 'postgres' {
  const forced = (process.env.QUEUE_BACKEND || '').toLowerCase()
  if (forced === 'postgres' || forced === 'pg') return 'postgres'
  if (forced === 'rabbitmq' || forced === 'amqp') return 'rabbitmq'
  if (!process.env.RABBITMQ_URL || process.env.RABBITMQ_URL === 'disabled') return 'postgres'
  return 'rabbitmq'
}

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
    res.json({
      ok: true,
      service: 'bulkmail-worker',
      provider: resolveProvider(),
      queue: resolveQueueBackend(),
    }),
  )
  app.get('/metrics', async (_req, res) => {
    res.set('Content-Type', client.register.contentType)
    res.end(await client.register.metrics())
  })
  app.listen(metricsPort, () => console.log(`[worker] metrics on :${metricsPort}`))
}

async function consumeRabbit() {
  for (;;) {
    try {
      const conn = await amqp.connect(rabbitUrl)
      const ch = await conn.createChannel()
      await ch.assertQueue(queueSend, { durable: true })
      ch.prefetch(10)
      console.log(`[worker] consuming rabbit ${queueSend} provider=${resolveProvider()}`)

      await new Promise<void>((resolve, reject) => {
        conn.on('error', reject)
        conn.on('close', () => reject(new Error('rabbit connection closed')))
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
      })
    } catch (e) {
      console.warn('[worker] rabbit unavailable, retry in 5s', e instanceof Error ? e.message : e)
      await new Promise((r) => setTimeout(r, 5000))
    }
  }
}

async function pollPostgres() {
  console.log(`[worker] polling postgres send_jobs provider=${resolveProvider()}`)
  for (;;) {
    try {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        const { rows } = await client.query<{ id: string; payload: SendJobPayload }>(
          `SELECT id, payload
           FROM send_jobs
           WHERE status='pending'
           ORDER BY created_at
           FOR UPDATE SKIP LOCKED
           LIMIT 5`,
        )
        for (const row of rows) {
          await client.query(
            `UPDATE send_jobs SET status='processing', locked_at=now() WHERE id=$1`,
            [row.id],
          )
        }
        await client.query('COMMIT')

        for (const row of rows) {
          try {
            await handleSend(row.payload)
            await pool.query(
              `UPDATE send_jobs SET status='done', done_at=now() WHERE id=$1`,
              [row.id],
            )
          } catch (e) {
            failCounter.inc({ provider: resolveProvider() })
            console.error('[worker] pg job failed', e)
            await pool.query(
              `UPDATE send_jobs SET status='failed', error=$2 WHERE id=$1`,
              [row.id, e instanceof Error ? e.message : String(e)],
            )
            try {
              await pool.query(`UPDATE messages SET status='failed', error=$2 WHERE id=$1`, [
                row.payload.messageId,
                e instanceof Error ? e.message : String(e),
              ])
            } catch {
              // ignore
            }
          }
        }
        if (!rows.length) await new Promise((r) => setTimeout(r, 1500))
      } catch (e) {
        try {
          await client.query('ROLLBACK')
        } catch {
          // ignore
        }
        throw e
      } finally {
        client.release()
      }
    } catch (e) {
      console.warn('[worker] pg poll error', e instanceof Error ? e.message : e)
      await new Promise((r) => setTimeout(r, 3000))
    }
  }
}

async function main() {
  await startMetricsServer()
  const backend = resolveQueueBackend()
  console.log(`[worker] queue backend=${backend}`)
  if (backend === 'postgres') {
    await pollPostgres()
  } else {
    await consumeRabbit()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
