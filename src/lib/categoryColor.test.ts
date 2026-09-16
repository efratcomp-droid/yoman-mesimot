import { describe, expect, it } from 'vitest'
import { categoryTextOnTint, categoryTint, readableTextOn } from './categoryColor'

describe('categoryColor', () => {
  it('builds a translucent tint from a hex color', () => {
    expect(categoryTint('#4A2C52')).toBe('rgba(74, 44, 82, 0.16)')
  })

  it('falls back to plum for an unparsable color', () => {
    expect(categoryTint('not-a-color')).toBe('rgba(74, 44, 82, 0.16)')
  })

  it('puts light text on a dark category color and dark text on a light one', () => {
    expect(readableTextOn('#4A2C52')).toBe('#FFFFFF')
    expect(readableTextOn('#F5E6A8')).toBe('#2B1D2E')
  })

  it('darkens a light category color so it reads on its own tint', () => {
    expect(categoryTextOnTint('#C98A2E')).not.toBe('#c98a2e')
  })
})
