import { SQL } from 'bun'
import { SCHEMA_SQL } from './schema'

const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL is not set. Add it to .env and restart the API server.')

// Serverless platforms start many instances, so the pool size is configurable (DB_POOL_MAX) and prepared statements can be
// switched off (DB_PREPARE=false) for poolers that run in transaction mode.
export const sql = new SQL(url, {
  max: Number(process.env.DB_POOL_MAX ?? 10),
  prepare: process.env.DB_PREPARE !== 'false',
})

/** Typed helper: runs a Bun SQL query and returns rows as T[]. */
export async function rows<T>(query: PromiseLike<unknown>): Promise<T[]> {
  return (await query) as T[]
}

export async function migrate(): Promise<void> {
  await sql.unsafe(SCHEMA_SQL)
}
