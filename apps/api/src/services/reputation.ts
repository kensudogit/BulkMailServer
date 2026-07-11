import { computeReputationScore, ReputationMetrics } from '@bms/shared'
import { query } from '../db'
import { cacheGet, cacheSet } from '../redis'

export async function getReputation(windowHours = 24): Promise<ReputationMetrics & { warnings: string[] }> {
  const cacheKey = `reputation:${windowHours}`
  const cached = await cacheGet<ReputationMetrics & { warnings: string[] }>(cacheKey)
  if (cached) return cached

  const { rows } = await query<{
    sent: string
    delivered: string
    bounce: string
    complaint: string
    opened: string
    clicked: string
  }>(
    `SELECT
       COUNT(*) FILTER (WHERE status IN ('sent','delivered','bounced','complained','unsubscribed','opened') OR sent_at IS NOT NULL) AS sent,
       COUNT(*) FILTER (WHERE delivered_at IS NOT NULL OR status = 'delivered') AS delivered,
       COUNT(*) FILTER (WHERE bounced_at IS NOT NULL OR status = 'bounced') AS bounce,
       COUNT(*) FILTER (WHERE complained_at IS NOT NULL OR status = 'complained') AS complaint,
       COUNT(*) FILTER (WHERE opened_at IS NOT NULL) AS opened,
       COUNT(*) FILTER (WHERE clicked_at IS NOT NULL) AS clicked
     FROM messages
     WHERE queued_at >= now() - ($1 || ' hours')::interval`,
    [String(windowHours)],
  )

  const r = rows[0] || { sent: '0', delivered: '0', bounce: '0', complaint: '0', opened: '0', clicked: '0' }
  const sentCount = Number(r.sent)
  const deliveredCount = Number(r.delivered)
  const bounceCount = Number(r.bounce)
  const complaintCount = Number(r.complaint)
  const openCount = Number(r.opened)
  const clickCount = Number(r.clicked)

  const denom = Math.max(sentCount, 1)
  const metrics = {
    sentCount,
    deliveredCount,
    bounceCount,
    complaintCount,
    openCount,
    clickCount,
    bounceRate: bounceCount / denom,
    complaintRate: complaintCount / denom,
    openRate: openCount / Math.max(deliveredCount, 1),
    clickRate: clickCount / Math.max(deliveredCount, 1),
    deliveryRate: deliveredCount / denom,
  }
  const score = computeReputationScore(metrics)
  const warnings: string[] = []
  if (metrics.bounceRate > 0.05) warnings.push('Bounce率が高すぎます（5%超）')
  if (metrics.complaintRate > 0.001) warnings.push('Complaint率が高すぎます（0.1%超）')
  if (metrics.deliveryRate < 0.95 && sentCount > 0) warnings.push('Delivery率が95%を下回っています')

  const result = { ...metrics, score, warnings }
  await cacheSet(cacheKey, result, 30)

  await query(
    `INSERT INTO reputation_snapshots
      (window_hours, sent_count, delivered_count, bounce_count, complaint_count, open_count, click_count,
       bounce_rate, complaint_rate, open_rate, click_rate, delivery_rate, score)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    [
      windowHours,
      sentCount,
      deliveredCount,
      bounceCount,
      complaintCount,
      openCount,
      clickCount,
      metrics.bounceRate,
      metrics.complaintRate,
      metrics.openRate,
      metrics.clickRate,
      metrics.deliveryRate,
      score,
    ],
  )

  return result
}
