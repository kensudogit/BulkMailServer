import { Pool, QueryResultRow } from 'pg'
import { env } from './config'

export const pool = new Pool({ connectionString: env.databaseUrl })

export async function query<T extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]) {
  return pool.query<T>(text, params)
}
