'use client'

const API = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8080'

export function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('bms_token')
}

export function setToken(token: string | null) {
  if (typeof window === 'undefined') return
  if (token) localStorage.setItem('bms_token', token)
  else localStorage.removeItem('bms_token')
}

export function isLoggedIn(): boolean {
  return Boolean(getToken())
}

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

function formatError(data: { error?: unknown }, status: number): string {
  if (status === 401) {
    const err = data.error
    if (err === 'unauthorized' || err === 'invalid token') {
      return 'ログインが必要です。ログインページから認証してください。'
    }
  }
  if (data.error == null) return `HTTP ${status}`
  return typeof data.error === 'string' ? data.error : JSON.stringify(data.error)
}

export async function api<T = unknown>(
  path: string,
  opts: RequestInit & { auth?: boolean } = {},
): Promise<T> {
  const headers = new Headers(opts.headers || {})
  if (!headers.has('Content-Type') && opts.body) headers.set('Content-Type', 'application/json')
  if (opts.auth !== false) {
    const token = getToken()
    if (token) headers.set('Authorization', `Bearer ${token}`)
  }
  const base = API.replace(/\/$/, '')
  const res = await fetch(`${base}${path}`, { ...opts, headers })
  const data = (await res.json().catch(() => ({}))) as { error?: unknown }
  if (!res.ok) throw new ApiError(formatError(data, res.status), res.status)
  return data as T
}

export { API }
