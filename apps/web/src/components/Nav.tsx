'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { setToken } from '@/lib/api'

const links = [
  { href: '/', label: 'ダッシュボード' },
  { href: '/campaigns', label: 'キャンペーン' },
  { href: '/recipients', label: '受信者' },
  { href: '/reputation', label: '信用スコア' },
  { href: '/guide', label: '利用手順' },
  { href: '/login', label: 'ログイン' },
]

export function Nav() {
  const pathname = usePathname()
  const router = useRouter()
  return (
    <nav className="nav">
      <strong>Bulk Mail Server</strong>
      {links.map((l) => (
        <Link key={l.href} href={l.href} className={pathname === l.href ? 'active' : undefined}>
          {l.label}
        </Link>
      ))}
      <button
        type="button"
        className="secondary"
        onClick={() => {
          setToken(null)
          router.push('/login')
        }}
      >
        ログアウト
      </button>
    </nav>
  )
}
