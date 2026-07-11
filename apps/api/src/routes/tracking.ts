import { Router } from 'express'
import { query } from '../db'

export const trackingRouter = Router()

const GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64',
)

trackingRouter.get('/open/:messageId.gif', async (req, res) => {
  const messageId = req.params.messageId.replace(/\.gif$/i, '')
  try {
    await query(
      `UPDATE messages SET opened_at=COALESCE(opened_at, now()) WHERE id=$1`,
      [messageId],
    )
    await query(
      `INSERT INTO delivery_events (message_id, event_type, payload)
       VALUES ($1,'open',$2)`,
      [messageId, JSON.stringify({ ua: req.headers['user-agent'] || null })],
    )
  } catch {
    // ignore invalid ids
  }
  res.setHeader('Content-Type', 'image/gif')
  res.setHeader('Cache-Control', 'no-store')
  res.send(GIF)
})

trackingRouter.get('/click/:messageId', async (req, res) => {
  const messageId = req.params.messageId
  const target = String(req.query.u || '')
  try {
    await query(
      `UPDATE messages SET clicked_at=COALESCE(clicked_at, now()), opened_at=COALESCE(opened_at, now()) WHERE id=$1`,
      [messageId],
    )
    await query(
      `INSERT INTO delivery_events (message_id, event_type, payload)
       VALUES ($1,'click',$2)`,
      [messageId, JSON.stringify({ url: target })],
    )
  } catch {
    // ignore
  }
  if (!target.startsWith('http')) return res.status(400).send('bad url')
  res.redirect(302, target)
})
