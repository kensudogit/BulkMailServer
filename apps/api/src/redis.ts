import Redis from 'ioredis'
import { env } from './config'

export const redis = new Redis(env.redisUrl)

export async function cacheGet<T>(key: string): Promise<T | null> {
  const raw = await redis.get(key)
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export async function cacheSet(key: string, value: unknown, ttlSec = 60) {
  await redis.set(key, JSON.stringify(value), 'EX', ttlSec)
}
