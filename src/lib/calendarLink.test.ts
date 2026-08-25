import { describe, expect, it } from 'vitest'
import { buildEventDetails, buildGoogleCalendarUrl, nextDay } from './calendarLink'

function paramsOf(url: string): URLSearchParams {
  return new URL(url).searchParams
}

describe('nextDay', () => {
  it('advances inside a month', () => {
    expect(nextDay('2026-08-05')).toBe('2026-08-06')
  })

  it('rolls over a month boundary', () => {
    expect(nextDay('2026-08-31')).toBe('2026-09-01')
  })

  it('rolls over a year boundary', () => {
    expect(nextDay('2026-12-31')).toBe('2027-01-01')
  })

  it('handles a leap day', () => {
    expect(nextDay('2028-02-28')).toBe('2028-02-29')
    expect(nextDay('2028-02-29')).toBe('2028-03-01')
  })

  it('handles a non-leap February', () => {
    expect(nextDay('2026-02-28')).toBe('2026-03-01')
  })
})

describe('buildEventDetails', () => {
  it('includes notes, category and priority', () => {
    expect(
      buildEventDetails({
        notes: 'להביא את המסמכים',
        categoryName: 'כספים',
        priority: 1,
      }),
    ).toBe('להביא את המסמכים\nקטגוריה: כספים\nעדיפות: דחוף')
  })

  it('omits empty notes', () => {
    expect(buildEventDetails({ notes: '   ', categoryName: 'תפעול', priority: 2 })).toBe(
      'קטגוריה: תפעול\nעדיפות: רגיל',
    )
  })

  it('omits a missing category', () => {
    expect(buildEventDetails({ notes: '', categoryName: null, priority: 3 })).toBe(
      'עדיפות: נמוך',
    )
  })
})

describe('buildGoogleCalendarUrl', () => {
  it('builds a template URL with the Hebrew title decoded back intact', () => {
    const url = buildGoogleCalendarUrl({
      title: 'להעביר דוח לרואה החשבון',
      dueDate: '2026-08-05',
      notes: 'כולל נספחים',
      categoryName: 'הנהלה',
      priority: 1,
    })

    expect(url.startsWith('https://calendar.google.com/calendar/render?')).toBe(true)
    // Hebrew must travel percent-encoded, never as raw characters.
    expect(url).not.toContain('דוח')

    const params = paramsOf(url)
    expect(params.get('action')).toBe('TEMPLATE')
    expect(params.get('text')).toBe('להעביר דוח לרואה החשבון')
    expect(params.get('dates')).toBe('20260805/20260806')
    expect(params.get('details')).toBe('כולל נספחים\nקטגוריה: הנהלה\nעדיפות: דחוף')
  })

  it('builds a URL without notes', () => {
    const url = buildGoogleCalendarUrl({
      title: 'פגישה',
      dueDate: '2026-08-05',
      notes: '',
      categoryName: null,
      priority: 2,
    })

    const params = paramsOf(url)
    expect(params.get('text')).toBe('פגישה')
    expect(params.get('details')).toBe('עדיפות: רגיל')
  })

  it('trims the title', () => {
    const url = buildGoogleCalendarUrl({
      title: '  משימה  ',
      dueDate: '2026-01-01',
      priority: 2,
    })

    expect(paramsOf(url).get('text')).toBe('משימה')
  })

  it('spans a month boundary correctly', () => {
    const url = buildGoogleCalendarUrl({
      title: 'סוף חודש',
      dueDate: '2026-08-31',
      priority: 2,
    })

    expect(paramsOf(url).get('dates')).toBe('20260831/20260901')
  })

  it('spans a year boundary correctly', () => {
    const url = buildGoogleCalendarUrl({
      title: 'סוף שנה',
      dueDate: '2026-12-31',
      priority: 3,
    })

    expect(paramsOf(url).get('dates')).toBe('20261231/20270101')
  })
})
