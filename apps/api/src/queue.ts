import amqp, { Channel } from 'amqplib'
import { env } from './config'

let ch: Channel | null = null

export async function getChannel(): Promise<Channel> {
  if (ch) return ch
  const conn = await amqp.connect(env.rabbitUrl)
  // amqplib 型定義の Connection / ChannelModel 差異を吸収
  const channel = await (conn as unknown as { createChannel: () => Promise<Channel> }).createChannel()
  await channel.assertQueue(env.queueSend, { durable: true })
  await channel.assertQueue('mail.bounce', { durable: true })
  await channel.assertQueue('mail.complaint', { durable: true })
  ch = channel
  return channel
}

export async function publishJson(queue: string, payload: unknown) {
  const channel = await getChannel()
  channel.sendToQueue(queue, Buffer.from(JSON.stringify(payload)), {
    persistent: true,
    contentType: 'application/json',
  })
}
