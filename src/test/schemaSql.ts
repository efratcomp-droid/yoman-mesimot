import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * The checked-in schema is the only description of the production database, so
 * tests read it directly rather than restating what they expect it to contain.
 */
export const schemaSql = readFileSync(
  resolve(process.cwd(), 'supabase/schema.sql'),
  'utf-8',
)

/** Column names of a `create table` block, in declaration order. */
export function tableColumns(table: string): string[] {
  const match = schemaSql.match(
    new RegExp(`create table if not exists ${table}\\s*\\(([\\s\\S]*?)\\n\\);`),
  )
  if (!match) {
    throw new Error(`No create table block for "${table}" in supabase/schema.sql`)
  }

  return match[1]
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('--'))
    .map((line) => line.split(/\s+/)[0])
}

/** Privileges granted on a table, keyed by role, as written in the schema. */
export function tableGrants(table: string): Record<string, Set<string>> {
  const grants: Record<string, Set<string>> = {}
  const pattern = new RegExp(
    `grant\\s+([a-z,\\s]+?)\\s+on\\s+table\\s+${table}\\s+to\\s+(\\w+)\\s*;`,
    'g',
  )

  for (const match of schemaSql.matchAll(pattern)) {
    const privileges = match[1].split(',').map((privilege) => privilege.trim().toLowerCase())
    const role = match[2]
    grants[role] ??= new Set()
    for (const privilege of privileges) {
      grants[role].add(privilege)
    }
  }

  return grants
}
