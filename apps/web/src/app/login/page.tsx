'use client'

import { FormEvent, Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Nav } from '@/components/Nav'
import { api, setToken } from '@/lib/api'
import { useAuthGuard } from '@/lib/useAuthGuard'

function LoginForm() {
  useAuthGuard({ requireAuth: false, redirectIfAuthed: true })
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('admin@example.local')
  const [password, setPassword] = useState('admin1234')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const data = await api<{ token: string }>('/auth/login', {
        method: 'POST',
        auth: false,
        body: JSON.stringify({ email, password }),
      })
      setToken(data.token)
      const next = searchParams.get('next') || '/'
      router.push(next.startsWith('/') ? next : '/')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="panel" style={{ maxWidth: 420 }}>
      <h1>ログイン</h1>
      <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
        初期ユーザー: admin@example.local / admin1234
      </p>
      <form onSubmit={onSubmit}>
        <label>Email</label>
        <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
        <label>Password</label>
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          type="password"
          required
        />
        <div className="row" style={{ marginTop: '1rem' }}>
          <button type="submit" disabled={loading}>
            {loading ? '認証中…' : 'ログイン'}
          </button>
        </div>
      </form>
      {error && <p className="err">{error}</p>}
    </div>
  )
}

export default function LoginPage() {
  return (
    <div className="shell">
      <Nav />
      <Suspense fallback={<div className="panel">読み込み中…</div>}>
        <LoginForm />
      </Suspense>
    </div>
  )
}
