import { Router } from 'express'
import { z } from 'zod'
import { authRequired } from '../auth'
import { query } from '../db'

export const recipientsRouter = Router()
recipientsRouter.use(authRequired)

recipientsRouter.get('/lists', async (_req, res) => {
  const { rows } = await query(
    `SELECT l.*, (SELECT COUNT(*) FROM recipients r WHERE r.list_id=l.id) AS recipient_count
     FROM recipient_lists l ORDER BY l.created_at DESC`,
  )
  res.json({ lists: rows })
})

recipientsRouter.post('/lists', async (req, res) => {
  const body = z.object({ name: z.string().min(1), description: z.string().optional() }).safeParse(req.body)
  if (!body.success) return res.status(400).json({ error: body.error.flatten() })
  const { rows } = await query(
    `INSERT INTO recipient_lists (name, description) VALUES ($1,$2) RETURNING *`,
    [body.data.name, body.data.description || null],
  )
  res.status(201).json({ list: rows[0] })
})

recipientsRouter.post('/import', async (req, res) => {
  const body = z
    .object({
      listId: z.string().uuid().optional(),
      recipients: z.array(z.object({ email: z.string().email(), name: z.string().optional() })).min(1),
    })
    .safeParse(req.body)
  if (!body.success) return res.status(400).json({ error: body.error.flatten() })

  let imported = 0
  let skipped = 0
  for (const r of body.data.recipients) {
    try {
      await query(
        `INSERT INTO recipients (list_id, email, name)
         VALUES ($1,$2,$3)
         ON CONFLICT (email) DO UPDATE SET
           list_id=COALESCE(EXCLUDED.list_id, recipients.list_id),
           name=COALESCE(EXCLUDED.name, recipients.name)`,
        [body.data.listId || null, r.email.toLowerCase(), r.name || null],
      )
      imported += 1
    } catch {
      skipped += 1
    }
  }
  res.json({ imported, skipped })
})

recipientsRouter.get('/', async (req, res) => {
  const listId = req.query.listId as string | undefined
  const { rows } = await query(
    `SELECT id, email, name, list_id, unsubscribed_at, suppressed_at, suppress_reason, created_at
     FROM recipients
     WHERE ($1::uuid IS NULL OR list_id=$1)
     ORDER BY created_at DESC LIMIT 500`,
    [listId || null],
  )
  res.json({ recipients: rows })
})
