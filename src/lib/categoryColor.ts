const FALLBACK_RGB: [number, number, number] = [74, 44, 82] // plum

const PAGE_RGB: [number, number, number] = [251, 247, 243] // cream

/** Light enough to read dark text on, strong enough to name the category. */
export const TINT_ALPHA = 0.16

const DARK_TEXT = '#2B1D2E'
const LIGHT_TEXT = '#FFFFFF'

function parseHex(color: string): [number, number, number] {
  const value = color.trim().replace(/^#/, '')
  const expanded =
    value.length === 3
      ? value
          .split('')
          .map((char) => char + char)
          .join('')
      : value
  if (!/^[0-9a-f]{6}$/i.test(expanded)) {
    return FALLBACK_RGB
  }
  return [
    parseInt(expanded.slice(0, 2), 16),
    parseInt(expanded.slice(2, 4), 16),
    parseInt(expanded.slice(4, 6), 16),
  ]
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const channels = [r, g, b].map((channel) => {
    const srgb = channel / 255
    return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
}

function contrast(a: number, b: number): number {
  const [lighter, darker] = a > b ? [a, b] : [b, a]
  return (lighter + 0.05) / (darker + 0.05)
}

/** A translucent wash of the category color, for the unselected chip. */
export function categoryTint(color: string, alpha = TINT_ALPHA): string {
  const [r, g, b] = parseHex(color)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function toHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((channel) => Math.round(channel).toString(16).padStart(2, '0')).join('')}`
}

/** The tint is translucent, so contrast has to be measured against what shows
 * through it — the page background. */
function composite(
  [r, g, b]: [number, number, number],
  alpha: number,
  over: [number, number, number],
): [number, number, number] {
  return [
    r * alpha + over[0] * (1 - alpha),
    g * alpha + over[1] * (1 - alpha),
    b * alpha + over[2] * (1 - alpha),
  ]
}

/**
 * The category color, darkened just enough to stay readable on its own tint.
 * Amber or sage at full strength on a pale wash of themselves fails contrast.
 */
export function categoryTextOnTint(color: string, alpha = TINT_ALPHA): string {
  const rgb = parseHex(color)
  const backgroundLuminance = relativeLuminance(composite(rgb, alpha, PAGE_RGB))
  let text = rgb
  for (let step = 0; step < 24; step += 1) {
    if (contrast(relativeLuminance(text), backgroundLuminance) >= 4.5) {
      return toHex(text)
    }
    text = [text[0] * 0.85, text[1] * 0.85, text[2] * 0.85]
  }
  return DARK_TEXT
}

/** Whichever of the two text colors reads better on the category color. */
export function readableTextOn(color: string): string {
  const background = relativeLuminance(parseHex(color))
  const onDark = contrast(background, relativeLuminance(parseHex(DARK_TEXT)))
  const onLight = contrast(background, relativeLuminance(parseHex(LIGHT_TEXT)))
  return onDark >= onLight ? DARK_TEXT : LIGHT_TEXT
}
