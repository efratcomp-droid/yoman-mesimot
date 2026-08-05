const ONES = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט']
const TENS = ['', 'י', 'כ', 'ל']

/** Hebrew gematria numeral for 1-30 (a Hebrew-calendar day of month). */
function toHebrewNumeral(day: number): string {
  if (day === 15) return 'ט״ו'
  if (day === 16) return 'ט״ז'

  const letters = TENS[Math.floor(day / 10)] + ONES[day % 10]
  if (letters.length <= 1) {
    return `${letters}׳`
  }
  return `${letters.slice(0, -1)}״${letters.slice(-1)}`
}

/**
 * Some ICU builds report the Hebrew calendar's numbering system as
 * "supported" but silently fall back to Western digits for it, so the day
 * number is converted to gematria by hand instead of relying on `nu-hebr`.
 */
export function formatHebrewCalendarDate(date: Date): string {
  const parts = new Intl.DateTimeFormat('he-IL-u-ca-hebrew', {
    day: 'numeric',
    month: 'long',
  }).formatToParts(date)

  return parts
    .map((part) =>
      part.type === 'day' ? toHebrewNumeral(Number(part.value)) : part.value,
    )
    .join('')
}

/** "יום רביעי, כ״ד באב · 5 באוגוסט" */
export function formatHeaderDate(date: Date): string {
  const weekday = new Intl.DateTimeFormat('he-IL', { weekday: 'long' }).format(date)
  const hebrew = formatHebrewCalendarDate(date)
  const gregorian = new Intl.DateTimeFormat('he-IL', {
    day: 'numeric',
    month: 'long',
  }).format(date)
  return `${weekday}, ${hebrew} · ${gregorian}`
}

/** Local (not UTC) YYYY-MM-DD, matching the `date` column's format. */
export function toDateOnly(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function addDays(dateOnly: string, days: number): string {
  const [year, month, day] = dateOnly.split('-').map(Number)
  return toDateOnly(new Date(year, month - 1, day + days))
}

export function startOfWeek(today: string): string {
  const [year, month, day] = today.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  date.setDate(date.getDate() - date.getDay())
  return toDateOnly(date)
}

export function endOfWeek(today: string): string {
  return addDays(startOfWeek(today), 6)
}

export interface DueMeta {
  text: string
  isLate: boolean
}

/** "היום" / "מחר" / "באיחור" / "ללא תאריך" / "הושלם", or a formatted date further out. */
export function formatDueMeta(
  dueDate: string | null,
  done: boolean,
  today: string,
): DueMeta {
  if (done) {
    return { text: 'הושלם', isLate: false }
  }
  if (!dueDate) {
    return { text: 'ללא תאריך', isLate: false }
  }
  if (dueDate < today) {
    return { text: 'באיחור', isLate: true }
  }
  if (dueDate === today) {
    return { text: 'היום', isLate: false }
  }
  if (dueDate === addDays(today, 1)) {
    return { text: 'מחר', isLate: false }
  }

  const [year, month, day] = dueDate.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  const text = new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'long' }).format(
    date,
  )
  return { text, isLate: false }
}
