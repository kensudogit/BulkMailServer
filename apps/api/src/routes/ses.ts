import { Router, Request, Response } from 'express'
import { query } from '../db'

/**
 * Amazon SES → SNS → HTTPS エンドポイント用 Webhook
 * SNS SubscriptionConfirmation / Notification を処理する
 */
export const sesRouter = Router()

type SesMail = {
  messageId?: string
  destination?: string[]
  commonHeaders?: { messageId?: string }
  tags?: Record<string, string[]>
}

type SesBounce = {
  bounceType?: string
  bouncedRecipients?: { emailAddress: string; diagnosticCode?: string }[]
}

type SesComplaint = {
  complainedRecipients?: { emailAddress: string }[]
  complaintFeedbackType?: string
}

type SesNotification = {
  notificationType?: string
  eventType?: string
  mail?: SesMail
  bounce?: SesBounce
  complaint?: SesComplaint
}

function extractBmsMessageId(mail?: SesMail): string | undefined {
  const tags = mail?.tags || {}
  const fromTag = tags['X-BMS-Message-Id']?.[0] || tags['bms_message_id']?.[0]
  return fromTag
}

async function applyBounce(email: string, messageId: string | undefined, bounceType: 'hard' | 'soft', diagnostic?: string, raw?: string) {
  await query(
    `INSERT INTO bounces (email, message_id, bounce_type, diagnostic, raw)
     VALUES ($1,$2,$3,$4,$5)`,
    [email, messageId || null, bounceType, diagnostic || null, raw || null],
  )
  if (bounceType === 'hard') {
    await query(
      `UPDATE recipients SET suppressed_at=COALESCE(suppressed_at, now()), suppress_reason='hard_bounce'
       WHERE email=$1`,
      [email],
    )
  }
  if (messageId) {
    await query(`UPDATE messages SET status='bounced', bounced_at=now() WHERE id=$1`, [messageId])
    await query(
      `INSERT INTO delivery_events (message_id, event_type, payload)
       VALUES ($1,'bounce',$2)`,
      [messageId, JSON.stringify({ email, bounceType, diagnostic, source: 'ses' })],
    )
  }
}

async function applyComplaint(email: string, messageId: string | undefined, feedbackType?: string, raw?: string) {
  await query(
    `INSERT INTO complaints (email, message_id, feedback_type, raw)
     VALUES ($1,$2,$3,$4)`,
    [email, messageId || null, feedbackType || null, raw || null],
  )
  await query(
    `UPDATE recipients
     SET unsubscribed_at=COALESCE(unsubscribed_at, now()),
         suppressed_at=COALESCE(suppressed_at, now()),
         suppress_reason='complaint'
     WHERE email=$1`,
    [email],
  )
  if (messageId) {
    await query(`UPDATE messages SET status='complained', complained_at=now() WHERE id=$1`, [messageId])
    await query(
      `INSERT INTO delivery_events (message_id, event_type, payload)
       VALUES ($1,'complaint',$2)`,
      [messageId, JSON.stringify({ email, feedbackType, source: 'ses' })],
    )
  }
}

async function handleSesNotification(note: SesNotification, raw: string) {
  const type = note.notificationType || note.eventType
  const messageId = extractBmsMessageId(note.mail)

  if (type === 'Bounce' || type === 'bounce') {
    const hard = (note.bounce?.bounceType || '').toLowerCase() === 'permanent'
    for (const r of note.bounce?.bouncedRecipients || []) {
      await applyBounce(
        r.emailAddress.toLowerCase(),
        messageId,
        hard ? 'hard' : 'soft',
        r.diagnosticCode,
        raw,
      )
    }
    return
  }

  if (type === 'Complaint' || type === 'complaint') {
    for (const r of note.complaint?.complainedRecipients || []) {
      await applyComplaint(
        r.emailAddress.toLowerCase(),
        messageId,
        note.complaint?.complaintFeedbackType,
        raw,
      )
    }
  }
}

sesRouter.post('/webhooks/ses', async (req: Request, res: Response) => {
  // SNS は Content-Type: text/plain で JSON を送ることがある
  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
  const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body)

  try {
    if (body.Type === 'SubscriptionConfirmation' && body.SubscribeURL) {
      // 購読確認（開発時は URL をログに出す。本番は自動 GET 推奨）
      console.log('[ses] SNS SubscriptionConfirmation:', body.SubscribeURL)
      try {
        await fetch(body.SubscribeURL)
      } catch (e) {
        console.warn('[ses] confirm fetch failed', e)
      }
      return res.json({ ok: true, confirmed: true })
    }

    if (body.Type === 'Notification' && body.Message) {
      const note = JSON.parse(body.Message) as SesNotification
      await handleSesNotification(note, raw)
      return res.json({ ok: true })
    }

    // 直接 SES イベント JSON が来た場合
    if (body.notificationType || body.eventType) {
      await handleSesNotification(body as SesNotification, raw)
      return res.json({ ok: true })
    }

    return res.status(400).json({ error: 'unsupported SNS/SES payload' })
  } catch (e) {
    console.error('[ses] webhook error', e)
    return res.status(500).json({ error: e instanceof Error ? e.message : String(e) })
  }
})
