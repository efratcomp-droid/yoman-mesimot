export interface Conflictable {
  updated_at: string
}

/**
 * Last-write-wins by updated_at. On an exact tie, keeps local to avoid
 * needlessly replacing a record with an identical one.
 */
export function resolveConflict<T extends Conflictable>(local: T, incoming: T): T {
  return new Date(incoming.updated_at).getTime() > new Date(local.updated_at).getTime()
    ? incoming
    : local
}
