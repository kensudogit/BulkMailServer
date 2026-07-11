import Redis from 'ioredis'
import { env } from './config'

/** Redis 未起動でも API を落とさない（Railway でプラグイン未追加時） */
export const redis = new Redis(env.redisUrl, {
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
  lazyConnect: true,
  retryStrategy: (times) => (times > 3 ? null : Math.min(times * 200, 2000)),
})

redis.on('error', (err) => {
  console.warn('[redis]', err.message)
})

async function ensureConnected(): Promise<boolean> {
  try {
    if (redis.status === 'wait') await redis.connect()
    return redis.status === 'ready' || redis.status === 'connecting'
  } catch {
    return false
  }
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    if (!(await ensureConnected())) return null
    const raw = await redis.get(key)
    if (!raw) return null
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export async function cacheSet(key: string, value: unknown, ttlSec = 60) {
  try {
    if (!(await ensureConnected())) return
    await redis.set(key, JSON.stringify(value), 'EX', ttlSec)
  } catch {
    // ignore
  }
}
