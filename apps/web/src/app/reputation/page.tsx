'use client'

import { FormEvent, useEffect, useState } from 'react'
import { Nav } from '@/components/Nav'
import { api } from '@/lib/api'
import { useAuthGuard } from '@/lib/useAuthGuard'

export default function ReputationPage() {
  useAuthGuard({ requireAuth: true })
  const [metrics, setMetrics] = useState<Record<string, unknown> | null>(null)
  const [ip, setIp] = useState('1.2.3.4')
  const [domain, setDomain] = useState('example.local')
  const [bl, setBl] = useState('')
  const [spf, setSpf] = useState('')
  const [history, setHistory] = useState<unknown[]>([])
  const [error, setError] = useState('')

  async function reload() {
    const m = await api<{ metrics: Record<string, unknown> }>('/reputation')
    setMetrics(m.metrics)
    const h = await api<{ checks: unknown[] }>('/reputation/blacklist-history')
    setHistory(h.checks)
  }

  useEffect(() => {
    reload().catch((e) => setError(e.message))
  }, [])

  async function checkBl(e: FormEvent) {
    e.preventDefault()
    setError('')
    try {
      const data = await api<{ listedAny: boolean; results: { provider: string; listed: boolean }[] }>(
        '/reputation/blacklist-check',
        { method: 'POST', body: JSON.stringify({ ip }) },
      )
      setBl(
        `${data.listedAny ? '掲載あり' : '未掲載'}\n` +
          data.results.map((r) => `${r.provider}: ${r.listed ? 'LISTED' : 'ok'}`).join('\n'),
      )
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function checkSpf(e: FormEvent) {
    e.preventDefault()
    const data = await api<{ spfOk: boolean; record: string | null }>('/reputation/spf-check', {
      method: 'POST',
      body: JSON.stringify({ domain }),
    })
    setSpf(`SPF: ${data.spfOk ? 'OK' : 'NG'}\n${data.record || '(no TXT)'}`)
  }

  return (
    <div className="shell">
      <Nav />
      <h1>信用スコア / ブラックリスト</h1>
      {metrics && (
        <div className="panel">
          <h2>監視指標</h2>
          <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(metrics, null, 2)}</pre>
        </div>
      )}
      <div className="panel">
        <h2>DNSBL チェック</h2>
        <form onSubmit={checkBl} className="row">
          <input value={ip} onChange={(e) => setIp(e.target.value)} placeholder="IPv4" />
          <button type="submit">チェック</button>
        </form>
        {bl && <pre>{bl}</pre>}
      </div>
      <div className="panel">
        <h2>SPF チェック</h2>
        <form onSubmit={checkSpf} className="row">
          <input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="domain" />
          <button type="submit">チェック</button>
        </form>
        {spf && <pre>{spf}</pre>}
        <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
          本番では Reverse DNS（PTR）も送信 IP に設定してください。
        </p>
      </div>
      <div className="panel">
        <h2>ブラックリスト履歴</h2>
        <pre style={{ maxHeight: 240, overflow: 'auto' }}>{JSON.stringify(history, null, 2)}</pre>
      </div>
      {error && <p className="err">{error}</p>}
    </div>
  )
}
