import { describe, expect, it } from 'vitest'
import {
  endOfWeek,
  formatDueMeta,
  formatHeaderDate,
  formatHebrewCalendarDate,
  startOfWeek,
  toDateOnly,
} from './formatDate'

describe('formatHebrewCalendarDate', () => {
  it('renders the Hebrew day as a gematria numeral', () => {
    // 5 Aug 2026 is 22 Av 5786.
    expect(formatHebrewCalendarDate(new Date(2026, 7, 5))).toBe('כ״ב באב')
  })

  it('uses the ט״ו / ט״ז exceptions instead of יה / יו', () => {
    // 26 Sep 2026 is 15 Tishrei 5787; 27 Sep 2026 is 16 Tishrei.
    expect(formatHebrewCalendarDate(new Date(2026, 8, 26))).toContain('ט״ו')
    expect(formatHebrewCalendarDate(new Date(2026, 8, 27))).toContain('ט״ז')
  })
})

describe('formatHeaderDate', () => {
  it('combines weekday, Hebrew date and Gregorian date', () => {
    expect(formatHeaderDate(new Date(2026, 7, 5))).toBe('יום רביעי, כ״ב באב · 5 באוגוסט')
  })
})

describe('toDateOnly', () => {
  it('formats using local date parts, not UTC', () => {
    expect(toDateOnly(new Date(2026, 0, 5))).toBe('2026-01-05')
  })
})

describe('startOfWeek / endOfWeek', () => {
  it('returns Sunday through Saturday for a mid-week date', () => {
    // 5 Aug 2026 is a Wednesday.
    expect(startOfWeek('2026-08-05')).toBe('2026-08-02')
    expect(endOfWeek('2026-08-05')).toBe('2026-08-08')
  })
})

describe('formatDueMeta', () => {
  const today = '2026-08-05'

  it('reports a done task as completed regardless of its due date', () => {
    expect(formatDueMeta('2026-08-01', true, today)).toEqual({
      text: 'הושלם',
      isLate: false,
    })
  })

  it('reports no due date', () => {
    expect(formatDueMeta(null, false, today)).toEqual({
      text: 'ללא תאריך',
      isLate: false,
    })
  })

  it('reports an overdue task as late', () => {
    expect(formatDueMeta('2026-08-04', false, today)).toEqual({
      text: 'באיחור',
      isLate: true,
    })
  })

  it('reports a task due today', () => {
    expect(formatDueMeta('2026-08-05', false, today)).toEqual({
      text: 'היום',
      isLate: false,
    })
  })

  it('reports a task due tomorrow', () => {
    expect(formatDueMeta('2026-08-06', false, today)).toEqual({
      text: 'מחר',
      isLate: false,
    })
  })

  it('formats a date further out via Intl', () => {
    expect(formatDueMeta('2026-08-12', false, today)).toEqual({
      text: '12 באוגוסט',
      isLate: false,
    })
  })
})
