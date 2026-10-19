import type { Format, Section } from '../types'

export const FORMAT_LABEL: Record<Format, string> = {
  pe: 'PE · Windows',
  elf: 'ELF · Linux',
  macho: 'Mach-O · macOS',
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  const units = ['KB', 'MB', 'GB']
  let v = n / 1024
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`
}

export const hex = (n: number, pad = 8) => '0x' + n.toString(16).padStart(pad, '0')

export function entropyLabel(e: number, size = 1): string {
  if (size === 0) return 'no file data'
  if (e >= 7.5) return 'compressed / encrypted'
  if (e >= 5.5) return 'code / binary data'
  if (e >= 3) return 'text / structured'
  return 'padding'
}

export function sectionAt(sections: Section[], offset: number): Section | undefined {
  return sections.find((s) => s.fileSize > 0 && offset >= s.fileOffset && offset < s.fileOffset + s.fileSize)
}

/**
 * Inferno colormap — perceptually uniform, readable on dark backgrounds.
 * Polynomial fit by Matt Zucker; the same coefficients are used in the WebGL shader.
 */
const C = [
  [0.0002189403691192265, 0.001651004631001012, -0.01948089843709184],
  [0.1065134194856116, 0.5639564367884091, 3.932712388889277],
  [11.60249308247187, -3.972853965665698, -15.9423941062914],
  [-41.70399613139459, 17.43639888205313, 44.35414519872813],
  [77.162935699427, -33.40235894210092, -81.80730925738993],
  [-71.31942824499214, 32.62606426397723, 73.20951985803202],
  [25.13112622477341, -12.24266895238567, -23.07032500287172],
]

export function inferno(t: number): string {
  t = Math.min(1, Math.max(0, t))
  const rgb = [0, 1, 2].map((ch) => {
    let v = 0
    for (let i = C.length - 1; i >= 0; i--) v = v * t + C[i][ch]
    return Math.round(Math.min(1, Math.max(0, v)) * 255)
  })
  return `rgb(${rgb.join(',')})`
}

/** Map entropy (0–8) into the palette, skipping the near-black and near-white extremes. */
export const entropyColor = (e: number) => inferno(0.06 + (e / 8) * 0.9)
