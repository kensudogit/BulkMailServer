import { Router } from 'express'
import { z } from 'zod'
import { query } from '../db'
import {
  authRequired,
  hashPassword,
  signToken,
  verifyPassword,
  AuthUser,
} from '../auth'

export const authRouter = Router()

authRouter.post('/login', async (req, res) => {
  const body = z.object({ email: z.string().email(), password: z.string().min(4) }).safeParse(req.body)
  if (!body.success) return res.status(400).json({ error: body.error.flatten() })

  const { rows } = await query<{ id: string; email: string; password_hash: string; name: string; role: string }>(
    `SELECT id, email, password_hash, name, role FROM users WHERE email=$1`,
    [body.data.email],
  )
  const user = rows[0]
  if (!user || !(await verifyPassword(body.data.password, user.password_hash))) {
    return res.status(401).json({ error: 'メールまたはパスワードが違います' })
  }
  const authUser: AuthUser = { id: user.id, email: user.email, role: user.role, name: user.name }
  return res.json({ token: signToken(authUser), user: authUser })
})

authRouter.post('/register', async (req, res) => {
  const body = z
    .object({ email: z.string().email(), password: z.string().min(8), name: z.string().min(1) })
    .safeParse(req.body)
  if (!body.success) return res.status(400).json({ error: body.error.flatten() })
  const hash = await hashPassword(body.data.password)
  try {
    const { rows } = await query<{ id: string; email: string; name: string; role: string }>(
      `INSERT INTO users (email, password_hash, name, role)
       VALUES ($1,$2,$3,'operator')
       RETURNING id, email, name, role`,
      [body.data.email, hash, body.data.name],
    )
    const user = rows[0]
    const authUser: AuthUser = { id: user.id, email: user.email, role: user.role, name: user.name }
    return res.status(201).json({ token: signToken(authUser), user: authUser })
  } catch {
    return res.status(409).json({ error: '既に登録済みのメールです' })
  }
})

authRouter.get('/me', authRequired, async (req, res) => {
  const user = (req as typeof req & { user?: AuthUser }).user
  return res.json({ user })
})
