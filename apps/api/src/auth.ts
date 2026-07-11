import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { Request, Response, NextFunction } from 'express'
import { env } from './config'

export type AuthUser = { id: string; email: string; role: string; name: string }

export function signToken(user: AuthUser): string {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role, name: user.name },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn as jwt.SignOptions['expiresIn'] },
  )
}

export function authRequired(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!token) return res.status(401).json({ error: 'unauthorized' })
  try {
    const payload = jwt.verify(token, env.jwtSecret) as jwt.JwtPayload
    ;(req as Request & { user?: AuthUser }).user = {
      id: String(payload.sub),
      email: String(payload.email),
      role: String(payload.role),
      name: String(payload.name || ''),
    }
    next()
  } catch {
    return res.status(401).json({ error: 'invalid token' })
  }
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10)
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash)
}

/** 配信停止リンク用ワンタイムトークン（email + messageId） */
export function signUnsubscribeToken(email: string, messageId: string): string {
  const payload = `${email}|${messageId}|${Date.now()}`
  const sig = crypto.createHmac('sha256', env.unsubscribeSecret).update(payload).digest('hex')
  return Buffer.from(`${payload}|${sig}`).toString('base64url')
}

export function verifyUnsubscribeToken(token: string): { email: string; messageId: string } | null {
  try {
    const raw = Buffer.from(token, 'base64url').toString('utf8')
    const parts = raw.split('|')
    if (parts.length !== 4) return null
    const [email, messageId, ts, sig] = parts
    const payload = `${email}|${messageId}|${ts}`
    const expect = crypto.createHmac('sha256', env.unsubscribeSecret).update(payload).digest('hex')
    if (sig !== expect) return null
    // 90日有効
    if (Date.now() - Number(ts) > 90 * 24 * 3600 * 1000) return null
    return { email, messageId }
  } catch {
    return null
  }
}
