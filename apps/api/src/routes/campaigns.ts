import { Router } from 'express'
import { z } from 'zod'
import { QUEUE, SendJobPayload } from '@bms/shared'
import { authRequired, signUnsubscribeToken, AuthUser } from '../auth'
import { query } from '../db'
import { publishJson } from '../queue'
import { env } from '../config'
import {
  buildTrackingPixelUrl,
  buildUnsubscribeUrl,
  injectComplianceHtml,
  wrapTrackedLinks,
  suggestCopy,
} from '../services/mailContent'

export const campaignsRouter = Router()
campaignsRouter.use(authRequired)

campaignsRouter.get('/', async (_req, res) => {
  const { rows } = await query(
    `SELECT c.*, 
      (SELECT COUNT(*) FROM messages m WHERE m.campaign_id=c.id) AS message_count,
      (SELECT COUNT(*) FROM messages m WHERE m.campaign_id=c.id AND m.status IN ('sent','delivered')) AS sent_count
     FROM campaigns c ORDER BY c.created_at DESC LIMIT 100`,
  )
  res.json({ campaigns: rows })
})

campaignsRouter.post('/', async (req, res) => {
  const body = z
    .object({
      name: z.string().min(1),
      subject: z.string().min(1),
      htmlBody: z.string().min(1),
      textBody: z.string().optional(),
      fromEmail: z.string().email(),
      replyTo: z.string().email().optional(),
      listId: z.string().uuid().optional(),
    })
    .safeParse(req.body)
  if (!body.success) return res.status(400).json({ error: body.error.flatten() })
  const user = (req as typeof req & { user?: AuthUser }).user!

  const { rows } = await query(
    `INSERT INTO campaigns (name, subject, html_body, text_body, from_email, reply_to, list_id, created_by, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'draft')
     RETURNING *`,
    [
      body.data.name,
      body.data.subject,
      body.data.htmlBody,
      body.data.textBody || null,
      body.data.fromEmail,
      body.data.replyTo || null,
      body.data.listId || null,
      user.id,
    ],
  )
  res.status(201).json({ campaign: rows[0] })
})

campaignsRouter.post('/:id/send', async (req, res) => {
  const campaignId = req.params.id
  const { rows: camps } = await query<{
    id: string
    subject: string
    html_body: string
    text_body: string | null
    from_email: string
    reply_to: string | null
    list_id: string | null
    status: string
  }>(`SELECT * FROM campaigns WHERE id=$1`, [campaignId])
  const campaign = camps[0]
  if (!campaign) return res.status(404).json({ error: 'campaign not found' })
  if (!['draft', 'scheduled', 'paused'].includes(campaign.status)) {
    return res.status(400).json({ error: `status=${campaign.status} では送信開始できません` })
  }

  // 配信停止・抑制済みを除外して受信者取得
  const { rows: recipients } = await query<{ id: string; email: string; name: string | null }>(
    `SELECT id, email, name FROM recipients
     WHERE unsubscribed_at IS NULL AND suppressed_at IS NULL
       AND ($1::uuid IS NULL OR list_id=$1)`,
    [campaign.list_id],
  )
  if (!recipients.length) return res.status(400).json({ error: '送信可能な受信者がいません' })

  await query(
    `UPDATE campaigns SET status='sending', started_at=now(), updated_at=now() WHERE id=$1`,
    [campaignId],
  )

  let enqueued = 0
  for (const r of recipients) {
    const { rows: msgs } = await query<{ id: string }>(
      `INSERT INTO messages (campaign_id, recipient_id, to_email, status)
       VALUES ($1,$2,$3,'queued')
       ON CONFLICT (campaign_id, recipient_id) DO NOTHING
       RETURNING id`,
      [campaignId, r.id, r.email],
    )
    const messageId = msgs[0]?.id
    if (!messageId) continue

    const token = signUnsubscribeToken(r.email, messageId)
    const unsubscribeUrl = buildUnsubscribeUrl(token)
    const trackingPixelUrl = buildTrackingPixelUrl(messageId)
    let html = injectComplianceHtml(campaign.html_body, { unsubscribeUrl, trackingPixelUrl })
    html = wrapTrackedLinks(html, messageId)

    const job: SendJobPayload = {
      messageId,
      campaignId,
      toEmail: r.email,
      toName: r.name,
      subject: campaign.subject,
      htmlBody: html,
      textBody: campaign.text_body,
      fromEmail: campaign.from_email,
      replyTo: campaign.reply_to,
      unsubscribeUrl,
      trackingPixelUrl,
    }
    await publishJson(env.queueSend || QUEUE.SEND, job)
    await query(
      `INSERT INTO delivery_events (message_id, campaign_id, event_type, payload)
       VALUES ($1,$2,'queued',$3)`,
      [messageId, campaignId, JSON.stringify({ to: r.email })],
    )
    enqueued += 1
  }

  await query(`UPDATE campaigns SET status='queued', updated_at=now() WHERE id=$1`, [campaignId])
  res.json({ ok: true, enqueued, apiBase: env.apiBaseUrl })
})

campaignsRouter.post('/:id/ai-suggest', async (req, res) => {
  const { rows } = await query<{ subject: string; html_body: string }>(
    `SELECT subject, html_body FROM campaigns WHERE id=$1`,
    [req.params.id],
  )
  if (!rows[0]) return res.status(404).json({ error: 'not found' })
  try {
    const suggestion = await suggestCopy({
      subject: rows[0].subject,
      htmlBody: rows[0].html_body,
      goal: req.body?.goal,
    })
    res.json({ suggestion })
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) })
  }
})

campaignsRouter.get('/:id', async (req, res) => {
  const { rows } = await query(`SELECT * FROM campaigns WHERE id=$1`, [req.params.id])
  if (!rows[0]) return res.status(404).json({ error: 'not found' })
  const stats = await query(
    `SELECT status, COUNT(*)::int AS count FROM messages WHERE campaign_id=$1 GROUP BY status`,
    [req.params.id],
  )
  res.json({ campaign: rows[0], stats: stats.rows })
})
