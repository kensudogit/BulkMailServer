import { Router } from 'express'
import { z } from 'zod'
import { authRequired, verifyUnsubscribeToken } from '../auth'
import { query } from '../db'

export const feedbackRouter = Router()

/** 公開: 配信停止 API（Web フォームから） */
feedbackRouter.post('/unsubscribe', async (req, res) => {
  const body = z.object({ token: z.string().min(10), reason: z.string().optional() }).safeParse(req.body)
  if (!body.success) return res.status(400).json({ error: 'invalid token' })
  const parsed = verifyUnsubscribeToken(body.data.token)
  if (!parsed) return res.status(400).json({ error: 'トークンが無効または期限切れです' })

  const email = parsed.email.toLowerCase()
  await query(
    `UPDATE recipients SET unsubscribed_at=COALESCE(unsubscribed_at, now()), suppress_reason='unsubscribe'
     WHERE email=$1`,
    [email],
  )
  await query(
    `INSERT INTO unsubscribes (email, message_id, reason, source)
     VALUES ($1,$2,$3,'link')
     ON CONFLICT (email) DO NOTHING`,
    [email, parsed.messageId, body.data.reason || null],
  )
  await query(
    `UPDATE messages SET status='unsubscribed', unsubscribed_at=now()
     WHERE id=$1`,
    [parsed.messageId],
  )
  await query(
    `INSERT INTO delivery_events (message_id, event_type, payload)
     VALUES ($1,'unsubscribe',$2)`,
    [parsed.messageId, JSON.stringify({ email, reason: body.data.reason || null })],
  )

  res.json({ ok: true, email, message: '配信を停止しました。今後このアドレスには送信しません。' })
})

/** 公開: Bounce Webhook（Postfix / SES 等から） */
feedbackRouter.post('/webhooks/bounce', async (req, res) => {
  const body = z
    .object({
      email: z.string().email(),
      messageId: z.string().uuid().optional(),
      bounceType: z.enum(['hard', 'soft']).default('hard'),
      diagnostic: z.string().optional(),
      raw: z.string().optional(),
    })
    .safeParse(req.body)
  if (!body.success) return res.status(400).json({ error: body.error.flatten() })

  const email = body.data.email.toLowerCase()
  await query(
    `INSERT INTO bounces (email, message_id, bounce_type, diagnostic, raw)
     VALUES ($1,$2,$3,$4,$5)`,
    [email, body.data.messageId || null, body.data.bounceType, body.data.diagnostic || null, body.data.raw || null],
  )

  if (body.data.bounceType === 'hard') {
    await query(
      `UPDATE recipients SET suppressed_at=COALESCE(suppressed_at, now()), suppress_reason='hard_bounce'
       WHERE email=$1`,
      [email],
    )
  }
  if (body.data.messageId) {
    await query(
      `UPDATE messages SET status='bounced', bounced_at=now() WHERE id=$1`,
      [body.data.messageId],
    )
    await query(
      `INSERT INTO delivery_events (message_id, event_type, payload)
       VALUES ($1,'bounce',$2)`,
      [body.data.messageId, JSON.stringify(body.data)],
    )
  }
  res.json({ ok: true })
})

/** 公開: Complaint Webhook（FBL / SES） */
feedbackRouter.post('/webhooks/complaint', async (req, res) => {
  const body = z
    .object({
      email: z.string().email(),
      messageId: z.string().uuid().optional(),
      feedbackType: z.string().optional(),
      raw: z.string().optional(),
    })
    .safeParse(req.body)
  if (!body.success) return res.status(400).json({ error: body.error.flatten() })

  const email = body.data.email.toLowerCase()
  await query(
    `INSERT INTO complaints (email, message_id, feedback_type, raw)
     VALUES ($1,$2,$3,$4)`,
    [email, body.data.messageId || null, body.data.feedbackType || null, body.data.raw || null],
  )
  await query(
    `UPDATE recipients
     SET unsubscribed_at=COALESCE(unsubscribed_at, now()),
         suppressed_at=COALESCE(suppressed_at, now()),
         suppress_reason='complaint'
     WHERE email=$1`,
    [email],
  )
  if (body.data.messageId) {
    await query(
      `UPDATE messages SET status='complained', complained_at=now() WHERE id=$1`,
      [body.data.messageId],
    )
    await query(
      `INSERT INTO delivery_events (message_id, event_type, payload)
       VALUES ($1,'complaint',$2)`,
      [body.data.messageId, JSON.stringify(body.data)],
    )
  }
  res.json({ ok: true })
})

feedbackRouter.get('/logs', authRequired, async (req, res) => {
  const limit = Math.min(Number(req.query.limit || 100), 500)
  const { rows } = await query(
    `SELECT * FROM delivery_events ORDER BY created_at DESC LIMIT $1`,
    [limit],
  )
  res.json({ events: rows })
})
