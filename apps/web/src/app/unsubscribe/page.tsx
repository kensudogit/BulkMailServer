'use client'

import { FormEvent, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { api } from '@/lib/api'
import { Suspense } from 'react'

function UnsubscribeForm() {
  const params = useSearchParams()
  const token = useMemo(() => params.get('token') || '', [params])
  const [reason, setReason] = useState('')
  const [done, setDone] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const data = await api<{ message: string }>('/unsubscribe', {
        method: 'POST',
        auth: false,
        body: JSON.stringify({ token, reason }),
      })
      setDone(data.message)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="shell" style={{ maxWidth: 560 }}>
      <div className="panel">
        <h1>配信停止</h1>
        <p style={{ color: 'var(--muted)' }}>
          配信停止手続きを行うと、今後このメールアドレスには送信しません。
        </p>
        {!token ? (
          <p className="err">トークンがありません。メール内の「配信停止はこちら」リンクからアクセスしてください。</p>
        ) : done ? (
          <p className="ok">{done}</p>
        ) : (
          <form onSubmit={onSubmit}>
            <label>理由（任意）</label>
            <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
            <div className="row" style={{ marginTop: '1rem' }}>
              <button type="submit" disabled={loading}>
                {loading ? '処理中…' : '配信停止する'}
              </button>
            </div>
          </form>
        )}
        {error && <p className="err">{error}</p>}
      </div>
    </div>
  )
}

export default function UnsubscribePage() {
  return (
    <Suspense fallback={<div className="shell">読み込み中…</div>}>
      <UnsubscribeForm />
    </Suspense>
  )
}
