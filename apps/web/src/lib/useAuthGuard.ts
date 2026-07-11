'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { getToken } from '@/lib/api'

/** 未ログインなら /login へ。ログイン済みで /login にいるなら / へ。 */
export function useAuthGuard(options?: { requireAuth?: boolean; redirectIfAuthed?: boolean }) {
  const requireAuth = options?.requireAuth ?? true
  const redirectIfAuthed = options?.redirectIfAuthed ?? false
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    const token = getToken()
    if (requireAuth && !token) {
      router.replace(`/login?next=${encodeURIComponent(pathname || '/')}`)
      return
    }
    if (redirectIfAuthed && token) {
      router.replace('/')
    }
  }, [requireAuth, redirectIfAuthed, router, pathname])
}
