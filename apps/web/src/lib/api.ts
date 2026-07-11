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
  const res = await fetch(`${API}${path}`, { ...opts, headers })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error ? JSON.stringify(data.error) : `HTTP ${res.status}`)
  return data as T
}

export { API }
