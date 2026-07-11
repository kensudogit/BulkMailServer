import amqp, { Channel } from 'amqplib'
import { env } from './config'
import { query } from './db'

let ch: Channel | null = null
let rabbitUnavailable = false

export type QueueBackend = 'rabbitmq' | 'postgres'

export function resolveQueueBackend(): QueueBackend {
  const forced = (process.env.QUEUE_BACKEND || '').toLowerCase()
  if (forced === 'postgres' || forced === 'pg') return 'postgres'
  if (forced === 'rabbitmq' || forced === 'amqp') return 'rabbitmq'
  // RABBITMQ_URL 未設定、または明示的に無効
  if (!process.env.RABBITMQ_URL || process.env.RABBITMQ_URL === 'disabled') return 'postgres'
  return 'rabbitmq'
}

async function getChannel(): Promise<Channel> {
  if (ch) return ch
  const conn = await amqp.connect(env.rabbitUrl)
  const channel = await (conn as unknown as { createChannel: () => Promise<Channel> }).createChannel()
  await channel.assertQueue(env.queueSend, { durable: true })
  await channel.assertQueue('mail.bounce', { durable: true })
  await channel.assertQueue('mail.complaint', { durable: true })
  ch = channel
  conn.on('close', () => {
    ch = null
  })
  return channel
}

/** RabbitMQ 優先。失敗時は Postgres send_jobs にフォールバック */
export async function publishJson(queue: string, payload: unknown) {
  const backend = resolveQueueBackend()
  if (backend === 'postgres' || rabbitUnavailable) {
    await enqueuePostgres(payload)
    return
  }
  try {
    const channel = await getChannel()
    channel.sendToQueue(queue, Buffer.from(JSON.stringify(payload)), {
      persistent: true,
      contentType: 'application/json',
    })
  } catch (e) {
    console.warn('[queue] rabbitmq publish failed — fallback to postgres', e)
    rabbitUnavailable = true
    ch = null
    await enqueuePostgres(payload)
  }
}

async function enqueuePostgres(payload: unknown) {
  await query(
    `INSERT INTO send_jobs (queue_name, payload, status)
     VALUES ($1, $2::jsonb, 'pending')`,
    [env.queueSend, JSON.stringify(payload)],
  )
}
