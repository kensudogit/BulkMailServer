'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { getToken, setToken } from '@/lib/api'

const links = [
  { href: '/', label: 'ダッシュボード' },
  { href: '/campaigns', label: 'キャンペーン' },
  { href: '/recipients', label: '受信者' },
  { href: '/reputation', label: '信用スコア' },
  { href: '/guide', label: '利用手順' },
]

export function Nav() {
  const pathname = usePathname()
  const router = useRouter()
  const [loggedIn, setLoggedIn] = useState(false)

  useEffect(() => {
    setLoggedIn(Boolean(getToken()))
  }, [pathname])

  return (
    <nav className="nav">
      <strong>Bulk Mail Server</strong>
      {links.map((l) => (
        <Link key={l.href} href={l.href} className={pathname === l.href ? 'active' : undefined}>
          {l.label}
        </Link>
      ))}
      {loggedIn ? (
        <button
          type="button"
          className="secondary"
          onClick={() => {
            setToken(null)
            setLoggedIn(false)
            router.push('/login')
          }}
        >
          ログアウト
        </button>
      ) : (
        <Link href="/login" className={pathname === '/login' ? 'active' : undefined}>
          ログイン
        </Link>
      )}
    </nav>
  )
}
