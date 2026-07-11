import fs from 'fs'
import path from 'path'
import { pool } from './db'

/** Railway / 初回起動時に sql/init.sql を適用（IF NOT EXISTS 前提） */
export async function ensureSchema() {
  const candidates = [
    path.resolve(process.cwd(), 'sql/init.sql'),
    path.resolve(__dirname, '../../../sql/init.sql'),
  ]
  const sqlPath = candidates.find((p) => fs.existsSync(p))
  if (!sqlPath) {
    console.warn('[api] sql/init.sql not found — skip schema ensure')
    return
  }
  const sql = fs.readFileSync(sqlPath, 'utf8')
  await pool.query(sql)
  console.log('[api] schema ensured from', sqlPath)
}
