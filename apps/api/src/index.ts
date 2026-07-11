import express from 'express'
import cors from 'cors'
import client from 'prom-client'
import { env } from './config'
import { authRouter } from './routes/auth'
import { campaignsRouter } from './routes/campaigns'
import { recipientsRouter } from './routes/recipients'
import { feedbackRouter } from './routes/feedback'
import { reputationRouter } from './routes/reputation'
import { trackingRouter } from './routes/tracking'
import { sesRouter } from './routes/ses'
import { hashPassword } from './auth'
import { query } from './db'

async function ensureAdmin() {
  const hash = await hashPassword('admin1234')
  await query(
    `INSERT INTO users (email, password_hash, name, role)
     VALUES ('admin@example.local', $1, 'Admin', 'admin')
     ON CONFLICT (email) DO UPDATE SET password_hash=$1`,
    [hash],
  )
}

async function main() {
  const app = express()
  app.use(cors({ origin: true, credentials: true }))
  // SNS は text/plain で JSON を送る場合がある
  app.use(express.json({ limit: '2mb', type: ['application/json', 'text/plain'] }))
  app.use(express.text({ type: 'text/plain', limit: '2mb' }))

  client.collectDefaultMetrics()
  const httpRequests = new client.Counter({
    name: 'bms_http_requests_total',
    help: 'HTTP requests',
    labelNames: ['method', 'route', 'status'] as const,
  })

  app.use((req, res, next) => {
    res.on('finish', () => {
      httpRequests.inc({ method: req.method, route: req.path, status: String(res.statusCode) })
    })
    next()
  })

  app.get('/health', (_req, res) => res.json({ ok: true, service: 'bulkmail-api' }))
  app.get('/metrics', async (_req, res) => {
    res.set('Content-Type', client.register.contentType)
    res.end(await client.register.metrics())
  })

  app.use('/auth', authRouter)
  app.use('/campaigns', campaignsRouter)
  app.use('/recipients', recipientsRouter)
  app.use('/', feedbackRouter)
  app.use('/', sesRouter)
  app.use('/reputation', reputationRouter)
  app.use('/t', trackingRouter)

  try {
    await ensureAdmin()
  } catch (e) {
    console.warn('[api] ensureAdmin skipped (DB not ready?):', e)
  }

  app.listen(env.port, () => {
    console.log(`[api] listening on :${env.port}`)
  })
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
