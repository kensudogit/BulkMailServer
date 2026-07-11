import { Router } from 'express'
import { z } from 'zod'
import { authRequired } from '../auth'
import { getReputation } from '../services/reputation'
import { checkIpBlacklists, checkSpfTxt } from '../services/blacklist'
import { query } from '../db'

export const reputationRouter = Router()
reputationRouter.use(authRequired)

reputationRouter.get('/', async (req, res) => {
  const hours = Number(req.query.windowHours || 24)
  const metrics = await getReputation(hours)
  res.json({ windowHours: hours, metrics })
})

reputationRouter.get('/history', async (_req, res) => {
  const { rows } = await query(
    `SELECT * FROM reputation_snapshots ORDER BY created_at DESC LIMIT 50`,
  )
  res.json({ snapshots: rows })
})

reputationRouter.post('/blacklist-check', async (req, res) => {
  const body = z.object({ ip: z.string().ip() }).safeParse(req.body)
  if (!body.success) return res.status(400).json({ error: 'IPv4 を指定してください' })
  const results = await checkIpBlacklists(body.data.ip)
  res.json({ ip: body.data.ip, results, listedAny: results.some((r) => r.listed) })
})

reputationRouter.post('/spf-check', async (req, res) => {
  const body = z.object({ domain: z.string().min(3) }).safeParse(req.body)
  if (!body.success) return res.status(400).json({ error: 'domain required' })
  const result = await checkSpfTxt(body.data.domain)
  res.json(result)
})

reputationRouter.get('/blacklist-history', async (_req, res) => {
  const { rows } = await query(
    `SELECT * FROM blacklist_checks ORDER BY checked_at DESC LIMIT 100`,
  )
  res.json({ checks: rows })
})

reputationRouter.get('/domains', async (_req, res) => {
  const { rows } = await query(`SELECT * FROM sending_domains ORDER BY domain`)
  res.json({ domains: rows })
})
