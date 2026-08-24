import { QueueRetryError } from './queue'

/**
 * Every write that fails has to reach the user in Hebrew, and has to say
 * whether the change is still on its way or gone for good. Anything the server
 * might still accept is retryable and stays in the queue; only a rejection that
 * a retry cannot change is permanent and rolls the change back.
 */

export interface SyncFailure {
  /** true → the operation stays queued and is retried later. */
  retryable: boolean
  /** Hebrew text shown to the user. */
  message: string
}

/** A permanent rejection, carrying the Hebrew text to show for it. */
export class SyncRejectionError extends Error {
  readonly userMessage: string

  constructor(userMessage: string) {
    super(userMessage)
    this.name = 'SyncRejectionError'
    this.userMessage = userMessage
  }
}

const OFFLINE = 'אין חיבור לרשת. השינוי נשמר במכשיר וישלח כשהחיבור יחזור.'
const NO_PERMISSION =
  'לשרת אין הרשאה לקבל את השינוי. השינוי נשמר במכשיר וינסה להישלח שוב.'
const EXPIRED_SESSION = 'ההתחברות פגה. התחברי מחדש כדי לשמור את השינויים.'
const SERVER_BUSY = 'השרת אינו זמין כרגע. השינוי נשמר במכשיר וישלח שוב.'
const SCHEMA_MISMATCH = 'מבנה הנתונים אינו תואם לשרת. יש לרענן את האפליקציה.'
const MISSING_CATEGORY = 'הקטגוריה שנבחרה כבר לא קיימת. בחרי קטגוריה אחרת.'
const REJECTED = 'השרת דחה את השינוי. בדקי את פרטי המשימה ונסי שוב.'
const GENERIC = 'השמירה בשרת נכשלה. נסי שוב.'

/** PostgREST returns an object, not an Error, so read the fields defensively. */
function readCode(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code: unknown }).code
    return typeof code === 'string' ? code : ''
  }
  return ''
}

function readMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message: unknown }).message
    return typeof message === 'string' ? message : ''
  }
  return ''
}

/**
 * A dropped fetch surfaces as a TypeError in the browser, and supabase-js
 * re-wraps it in a plain object whose message keeps the original wording.
 */
function isNetworkFailure(error: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return true
  }
  if (error instanceof TypeError) {
    return true
  }
  const message = readMessage(error).toLowerCase()
  return (
    message.includes('failed to fetch') ||
    message.includes('networkerror') ||
    message.includes('load failed') ||
    message.includes('network request failed')
  )
}

/** Decides how a failed write should be reported and whether it may be retried. */
export function classifySyncError(error: unknown): SyncFailure {
  if (error instanceof QueueRetryError) {
    return { retryable: true, message: error.userMessage }
  }
  if (error instanceof SyncRejectionError) {
    return { retryable: false, message: error.userMessage }
  }
  if (isNetworkFailure(error)) {
    return { retryable: true, message: OFFLINE }
  }

  const code = readCode(error)

  // insufficient_privilege — the role lacks the table grant, so RLS is never
  // even reached. A server-side fix makes the queued change deliverable, so the
  // change is kept rather than thrown away.
  if (code === '42501') {
    return { retryable: true, message: NO_PERMISSION }
  }
  // PGRST301/302: the JWT is missing, expired, or was rejected.
  if (code === 'PGRST301' || code === 'PGRST302' || code === '42P17') {
    return { retryable: true, message: EXPIRED_SESSION }
  }
  // Connection, resource and operator-intervention classes: all transient.
  if (code.startsWith('08') || code.startsWith('53') || code.startsWith('57')) {
    return { retryable: true, message: SERVER_BUSY }
  }
  // PGRST204: a column in the payload does not exist on the table.
  // PGRST205/42P01: the table itself is missing from the schema cache.
  if (code === 'PGRST204' || code === 'PGRST205' || code === '42P01') {
    return { retryable: false, message: SCHEMA_MISMATCH }
  }
  // foreign_key_violation — almost always a category deleted on another device.
  if (code === '23503') {
    return { retryable: false, message: MISSING_CATEGORY }
  }
  // not_null_violation / check_violation / invalid input syntax.
  if (code === '23502' || code === '23514' || code.startsWith('22')) {
    return { retryable: false, message: REJECTED }
  }

  return { retryable: false, message: GENERIC }
}

/** Converts any failure into the error type the queue understands. */
export function toQueueError(error: unknown): Error {
  const failure = classifySyncError(error)
  return failure.retryable
    ? new QueueRetryError(failure.message)
    : new SyncRejectionError(failure.message)
}

/** The Hebrew text to show for a failure the queue reported. */
export function toUserMessage(error: unknown): string {
  return classifySyncError(error).message
}
