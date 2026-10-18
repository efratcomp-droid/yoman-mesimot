import { describe, expect, it } from 'vitest'
import { schemaSql, tableColumns, tableGrants } from './schemaSql'
import type { Category, Task } from '../types/database'

/**
 * These assertions exist because a production bug hid here: the RLS policies
 * were flawless, but no role had been granted the table privileges the policies
 * are evaluated on top of. Postgres refused every client request with 403
 * before a single policy ran, and the tasks table stayed empty.
 */

// A key per field of the TypeScript row type — the compiler rejects this object
// if it drifts from the type, and the tests below tie it to the SQL.
const TASK_FIELDS: Record<keyof Task, true> = {
  id: true,
  user_id: true,
  title: true,
  notes: true,
  category_id: true,
  priority: true,
  due_date: true,
  done: true,
  done_at: true,
  created_at: true,
  updated_at: true,
  deleted_at: true,
}

const CATEGORY_FIELDS: Record<keyof Category, true> = {
  id: true,
  user_id: true,
  name: true,
  color: true,
  position: true,
}

const WRITE_PRIVILEGES = ['select', 'insert', 'update', 'delete']

describe('supabase/schema.sql — table privileges', () => {
  // RLS filters rows only after Postgres has confirmed the role may touch the
  // table at all. Without these grants every request is rejected with
  // "permission denied for table", which the client sees as a bare 403.
  it.each(['tasks', 'categories'])(
    'grants select/insert/update/delete on %s to authenticated',
    (table) => {
      const granted = tableGrants(table).authenticated

      expect(granted, `no grant on ${table} to authenticated`).toBeDefined()
      for (const privilege of WRITE_PRIVILEGES) {
        expect([...granted]).toContain(privilege)
      }
    },
  )

  it.each(['tasks', 'categories'])('does not grant %s to anon', (table) => {
    expect(tableGrants(table).anon).toBeUndefined()
    expect(schemaSql).toContain(`revoke all on table ${table} from anon;`)
  })
})

describe('supabase/schema.sql — row level security', () => {
  it.each(['tasks', 'categories'])('keeps RLS enabled on %s', (table) => {
    expect(schemaSql).toContain(`alter table ${table} enable row level security;`)
  })

  it.each(['tasks', 'categories'])(
    'has one owner policy per operation on %s',
    (table) => {
      for (const operation of ['select', 'insert', 'update', 'delete']) {
        expect(schemaSql).toContain(`create policy ${table}_${operation}_own on ${table}`)
      }
    },
  )

  it('scopes every policy to the caller, never to a wider condition', () => {
    const conditions = [
      ...schemaSql.matchAll(/(?:using|with check)\s*\(([^)]*\))?\)/g),
    ].map((match) => match[0])

    expect(conditions.length).toBeGreaterThan(0)
    for (const condition of conditions) {
      expect(condition).toContain('user_id = auth.uid()')
    }
  })
})

describe('supabase/schema.sql — columns match the TypeScript row types', () => {
  // A payload carrying a column the table does not have is rejected wholesale,
  // so the two definitions have to agree exactly, in both directions.
  it('tasks', () => {
    expect(tableColumns('tasks').sort()).toEqual(Object.keys(TASK_FIELDS).sort())
  })

  it('categories', () => {
    expect(tableColumns('categories').sort()).toEqual(Object.keys(CATEGORY_FIELDS).sort())
  })

  it('requires user_id on every row', () => {
    for (const table of ['tasks', 'categories']) {
      expect(tableColumns(table)).toContain('user_id')
      expect(schemaSql).toMatch(
        new RegExp(`user_id\\s+uuid not null references auth\\.users\\(id\\)`),
      )
    }
  })
})

describe('supabase/schema.sql — keep_alive()', () => {
  // The daily ping has to run a real SQL query: /auth/v1/health never reached
  // Postgres, so the inactivity counter kept running and the project was
  // suspended with the workflow green.
  const definition = schemaSql.match(
    /create or replace function public\.keep_alive\(\)[\s\S]*?\$\$;/,
  )?.[0]

  it('is defined and returns a timestamp', () => {
    expect(definition).toBeDefined()
    expect(definition).toContain('returns timestamptz')
  })

  it('may be executed by anon, since the ping only holds the public key', () => {
    expect(schemaSql).toContain(
      'grant execute on function public.keep_alive() to anon, authenticated;',
    )
    expect(schemaSql).toContain('revoke all on function public.keep_alive() from public;')
  })

  // The three properties that keep it from becoming a way in: it runs with the
  // caller's privileges, writing is rejected, and what it resolves is fixed.
  it('runs as the caller, cannot write, and has a locked search_path', () => {
    expect(definition).toContain('security invoker')
    expect(definition).not.toContain('security definer')
    expect(definition).toContain('stable')
    expect(definition).toContain("set search_path = ''")
  })

  it('reads no table and writes nothing', () => {
    const body = definition?.match(/as \$\$([\s\S]*?)\$\$;/)?.[1] ?? ''
    expect(body.trim()).toBe('select now();')
    for (const table of ['tasks', 'categories']) {
      expect(body).not.toContain(table)
    }
    for (const statement of ['insert', 'update', 'delete', 'grant', 'alter']) {
      expect(body).not.toContain(statement)
    }
  })
})

describe('supabase/schema.sql — trigger functions are not callable from the API', () => {
  // Both are SECURITY DEFINER. Left with the default ACL, PUBLIC keeps EXECUTE
  // and they can be invoked as RPC with the public key — which they were never
  // meant to be. Postgres checks EXECUTE when the trigger is created, not when
  // it fires, so the revoke does not disturb the trigger itself.
  it('revokes execute on create_default_categories()', () => {
    expect(schemaSql).toContain(
      'revoke all on function create_default_categories() from public, anon, authenticated;',
    )
  })

  it('revokes execute on the platform event-trigger function when it exists', () => {
    expect(schemaSql).toContain(
      'revoke all on function public.rls_auto_enable() from public, anon, authenticated;',
    )
  })
})

describe('supabase/schema.sql — no secrets', () => {
  it('never mentions the service role', () => {
    expect(schemaSql).not.toContain('service_role')
  })
})
