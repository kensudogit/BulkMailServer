import path from 'path'
import dotenv from 'dotenv'

dotenv.config({ path: path.resolve(__dirname, '../../../.env') })
dotenv.config({ path: path.resolve(__dirname, '../../../.env.example') })

function req(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback
  if (v == null || v === '') throw new Error(`Missing env: ${name}`)
  return v
}

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.API_PORT || 8080),
  apiBaseUrl: process.env.API_BASE_URL || 'http://localhost:8080',
  webBaseUrl: process.env.WEB_BASE_URL || 'http://localhost:3000',
  jwtSecret: req('JWT_SECRET', 'change-me-bulk-mail-jwt-secret-32chars'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '12h',
  databaseUrl: req('DATABASE_URL', 'postgresql://bms:bms_secret@localhost:5432/bulkmail'),
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  rabbitUrl: process.env.RABBITMQ_URL || 'amqp://bms:bms_secret@localhost:5672',
  queueSend: process.env.RABBITMQ_QUEUE_SEND || 'mail.send',
  unsubscribeSecret: req('UNSUBSCRIBE_TOKEN_SECRET', 'change-me-unsubscribe-secret'),
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  openaiModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  bounceWarn: Number(process.env.REPUTATION_BOUNCE_WARN || 0.05),
  complaintWarn: Number(process.env.REPUTATION_COMPLAINT_WARN || 0.001),
  deliveryWarn: Number(process.env.REPUTATION_DELIVERY_WARN || 0.95),
}
