import dns from 'dns/promises'
import { query } from '../db'

/** 代表的な DNSBL（開発用。本番は商用 RBL / 自社監視も併用） */
const DNSBL_ZONES = [
  'zen.spamhaus.org',
  'bl.spamcop.net',
  'b.barracudacentral.org',
]

export async function checkIpBlacklists(ip: string) {
  const reversed = ip.split('.').reverse().join('.')
  const results: { provider: string; listed: boolean; details?: string }[] = []

  for (const zone of DNSBL_ZONES) {
    const host = `${reversed}.${zone}`
    try {
      const addrs = await dns.resolve4(host)
      const listed = addrs.length > 0
      results.push({ provider: zone, listed, details: listed ? addrs.join(',') : undefined })
      await query(
        `INSERT INTO blacklist_checks (target, target_type, provider, listed, details)
         VALUES ($1,'ip',$2,$3,$4)`,
        [ip, zone, listed, listed ? addrs.join(',') : null],
      )
    } catch (e: unknown) {
      const code = (e as NodeJS.ErrnoException).code
      // ENOTFOUND = 未掲載
      if (code === 'ENOTFOUND' || code === 'ENODATA') {
        results.push({ provider: zone, listed: false })
        await query(
          `INSERT INTO blacklist_checks (target, target_type, provider, listed)
           VALUES ($1,'ip',$2,false)`,
          [ip, zone],
        )
      } else {
        results.push({ provider: zone, listed: false, details: `check_error:${code || 'unknown'}` })
      }
    }
  }
  return results
}

export async function checkSpfTxt(domain: string) {
  try {
    const records = await dns.resolveTxt(domain)
    const flat = records.map((r) => r.join('')).join(' ')
    const hasSpf = /v=spf1/i.test(flat)
    await query(
      `UPDATE sending_domains SET spf_ok=$2, updated_at=now() WHERE domain=$1`,
      [domain, hasSpf],
    )
    return { domain, spfOk: hasSpf, record: flat || null }
  } catch {
    return { domain, spfOk: false, record: null }
  }
}
