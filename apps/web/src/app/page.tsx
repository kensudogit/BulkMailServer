'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Nav } from '@/components/Nav'
import { api, ApiError, getToken } from '@/lib/api'
import { useAuthGuard } from '@/lib/useAuthGuard'

type Metrics = {
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
  warnings: string[]
}

export default function HomePage() {
  useAuthGuard({ requireAuth: true })
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!getToken()) return
    api<{ metrics: Metrics }>('/reputation')
      .then((d) => setMetrics(d.metrics))
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) {
          setError('ログインが必要です。')
          return
        }
        setError(e instanceof Error ? e.message : String(e))
      })
  }, [])

  const pct = (n: number) => `${(n * 100).toFixed(2)}%`

  return (
    <div className="shell">
      <Nav />
      <h1>配信ダッシュボード</h1>
      <p style={{ color: 'var(--muted)' }}>直近 24 時間の信用スコアと配信指標</p>
      {error && (
        <p className="err">
          {error} <Link href="/login">ログインへ</Link>
        </p>
      )}
      {metrics && (
        <>
          <div className="grid" style={{ marginTop: '1rem' }}>
            <div className="metric">
              <div className="label">信用スコア</div>
              <div className="value">{metrics.score}</div>
            </div>
            <div className="metric">
              <div className="label">Delivery率</div>
              <div className="value">{pct(metrics.deliveryRate)}</div>
            </div>
            <div className="metric">
              <div className="label">Bounce率</div>
              <div className="value">{pct(metrics.bounceRate)}</div>
            </div>
            <div className="metric">
              <div className="label">Complaint率</div>
              <div className="value">{pct(metrics.complaintRate)}</div>
            </div>
            <div className="metric">
              <div className="label">Open率</div>
              <div className="value">{pct(metrics.openRate)}</div>
            </div>
            <div className="metric">
              <div className="label">Click率</div>
              <div className="value">{pct(metrics.clickRate)}</div>
            </div>
          </div>
          {metrics.warnings?.length > 0 && (
            <div className="panel">
              <strong>警告</strong>
              <ul>
                {metrics.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
      <div className="panel">
        <h2>構成</h2>
        <p>
          Next.js コンソール · Node API · RabbitMQ/Postgres Worker · Mailpit/SES · PostgreSQL · Redis ·
          Prometheus/Grafana · OpenSearch
        </p>
        <p>配信停止リンク・Bounce/Complaint Webhook・DNSBL/SPF 監視を標準搭載しています。</p>
        <p>
          <a href="/guide">利用手順パネル</a>
          （ローカル起動・SES 最短切替・アーキテクチャ）
        </p>
      </div>
    </div>
  )
}
