import type { Priority } from '../types/database'

const GOOGLE_CALENDAR_RENDER_URL = 'https://calendar.google.com/calendar/render'

const PRIORITY_LABEL: Record<Priority, string> = {
  1: 'דחוף',
  2: 'רגיל',
  3: 'נמוך',
}

export interface CalendarEventInput {
  title: string
  dueDate: string
  notes?: string
  categoryName?: string | null
  priority: Priority
}

/** YYYY-MM-DD → YYYYMMDD, the compact form Google's template URL expects. */
export function toCompactDate(dateOnly: string): string {
  return dateOnly.replace(/-/g, '')
}

/**
 * Google treats the end of an all-day event as exclusive, so a task due on a
 * single day ends the following day. Arithmetic goes through Date.UTC so a
 * daylight-saving shift can never move the result onto the wrong date.
 */
export function nextDay(dateOnly: string): string {
  const [year, month, day] = dateOnly.split('-').map(Number)
  const next = new Date(Date.UTC(year, month - 1, day + 1))
  const nextYear = String(next.getUTCFullYear()).padStart(4, '0')
  const nextMonth = String(next.getUTCMonth() + 1).padStart(2, '0')
  const nextDate = String(next.getUTCDate()).padStart(2, '0')
  return `${nextYear}-${nextMonth}-${nextDate}`
}

/** The event description: notes, category and priority, each on its own line. */
export function buildEventDetails({
  notes,
  categoryName,
  priority,
}: Pick<CalendarEventInput, 'notes' | 'categoryName' | 'priority'>): string {
  const lines: string[] = []
  const trimmedNotes = notes?.trim()
  if (trimmedNotes) {
    lines.push(trimmedNotes)
  }
  if (categoryName) {
    lines.push(`קטגוריה: ${categoryName}`)
  }
  lines.push(`עדיפות: ${PRIORITY_LABEL[priority]}`)
  return lines.join('\n')
}

/**
 * Builds a Google Calendar "quick add" template URL for a task. No OAuth and
 * no API key: the link only pre-fills the form, and the user confirms there.
 */
export function buildGoogleCalendarUrl(task: CalendarEventInput): string {
  const start = toCompactDate(task.dueDate)
  const end = toCompactDate(nextDay(task.dueDate))

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: task.title.trim(),
    dates: `${start}/${end}`,
    details: buildEventDetails(task),
  })

  return `${GOOGLE_CALENDAR_RENDER_URL}?${params.toString()}`
}
