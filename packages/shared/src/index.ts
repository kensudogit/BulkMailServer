/** 共有型・定数（API / Worker / Web） */

export type CampaignStatus =
  | 'draft'
  | 'scheduled'
  | 'queued'
  | 'sending'
  | 'completed'
  | 'paused'
  | 'cancelled'

export type MessageStatus =
  | 'queued'
  | 'sending'
  | 'sent'
  | 'delivered'
  | 'bounced'
  | 'complained'
  | 'unsubscribed'
  | 'suppressed'
  | 'failed'

export type DeliveryEventType =
  | 'queued'
  | 'sent'
  | 'delivered'
  | 'open'
  | 'click'
  | 'bounce'
  | 'complaint'
  | 'unsubscribe'

export interface SendJobPayload {
  messageId: string
  campaignId: string
  toEmail: string
  toName?: string | null
  subject: string
  htmlBody: string
  textBody?: string | null
  fromEmail: string
  replyTo?: string | null
  unsubscribeUrl: string
  trackingPixelUrl: string
}

export interface ReputationMetrics {
  sentCount: number
  deliveredCount: number
  bounceCount: number
  complaintCount: number
  openCount: number
  clickCount: number
  bounceRate: number
  complaintRate: number
  openRate: number
  clickRate: number
  deliveryRate: number
  score: number
}

/** 信用スコア算出（0-100）。Bounce/Complaint を強く減点 */
export function computeReputationScore(m: Omit<ReputationMetrics, 'score'>): number {
  let score = 100
  score -= Math.min(50, m.bounceRate * 1000) // 5% bounce ≈ -50
  score -= Math.min(40, m.complaintRate * 20000) // 0.1% complaint ≈ -20
  if (m.deliveryRate < 0.95) score -= (0.95 - m.deliveryRate) * 100
  if (m.openRate > 0) score += Math.min(5, m.openRate * 10)
  return Math.max(0, Math.min(100, Number(score.toFixed(2))))
}

export const QUEUE = {
  SEND: 'mail.send',
  BOUNCE: 'mail.bounce',
  COMPLAINT: 'mail.complaint',
} as const
