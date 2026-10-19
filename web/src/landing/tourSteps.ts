import type { ByteRange, Report, Section } from '../types'
import { FORMAT_LABEL, formatBytes, sectionAt } from '../lib/format'
import { classifyString, detectCapabilities, type Capability } from '../lib/capabilities'

export type TourPanel = 'overview' | 'sections' | 'packed' | 'capabilities' | 'strings'

export interface TourStep {
  id: TourPanel
  title: string
  body: string
  highlight: ByteRange | null
}

/**
 * Rust string literals aren't NUL-terminated, so the extractor often returns a path glued to
 * the text stored before it ("...not a PE, ELF or Mach-O executable~\.cargo\..."). Keep the path.
 */
function cleanPath(s: string): string {
  const m = s.match(/(~[\\/]|[A-Za-z]:\\|\/)?[\w.-]+(?:[\\/][\w.@-]+)+\.\w+/g)
  return m ? m.reduce((a, b) => (b.length > a.length ? b : a)) : s
}

const range = (s: Section): ByteRange => ({ start: s.fileOffset, end: s.fileOffset + s.fileSize })
const pct = (part: number, whole: number) => Math.round((part / whole) * 100)

/**
 * The landing-page walkthrough, written from a live analysis rather than by hand —
 * if the sample binary changes, the copy changes with it and never lies.
 */
export function buildTour(report: Report, fileName: string): { steps: TourStep[]; caps: Capability[]; paths: string[] } {
  const b = report.binary
  const steps: TourStep[] = []
  const caps = b ? detectCapabilities(b.imports) : []
  const pathStrings = report.strings.filter((s) => classifyString(s.text) === 'path')
  const paths = [...new Set(pathStrings.map((s) => cleanPath(s.text)))]

  steps.push({
    id: 'overview',
    title: 'Start with the shape',
    body: b
      ? `${fileName} is a ${b.is64 ? '64' : '32'}-bit ${FORMAT_LABEL[b.format].split(' · ')[1]} program for ${b.arch.toLowerCase()}, ${formatBytes(report.size)} on disk. Each square on the map is ${report.blockSize} bytes, coloured by how random those bytes look.`
      : `Each square on the map is ${report.blockSize} bytes of ${fileName}, coloured by how random those bytes look.`,
    highlight: null,
  })

  if (b && b.sections.length) {
    const withData = b.sections.filter((s) => s.fileSize > 0)
    const biggest = withData.reduce((a, s) => (s.fileSize > a.fileSize ? s : a), withData[0])
    steps.push({
      id: 'sections',
      title: 'Find the code',
      body: `The file is split into ${b.sections.length} sections. The largest, ${biggest.name}, is ${formatBytes(biggest.fileSize)} — ${pct(biggest.fileSize, report.size)}% of the file — at ${biggest.entropy.toFixed(2)} bits per byte, which is what compiled machine code looks like.`,
      highlight: range(biggest),
    })

    const hottest = withData.reduce((a, s) => (s.entropy > a.entropy ? s : a), withData[0])
    const packed = hottest.entropy >= 7.5
    steps.push({
      id: 'packed',
      title: 'Check for anything hidden',
      body: packed
        ? `${hottest.name} sits at ${hottest.entropy.toFixed(2)} bits per byte — almost perfectly random. That means compressed or encrypted data: packed code, an embedded archive, or keys.`
        : `Nothing here passes 7.5 bits per byte; the most random section is ${hottest.name} at ${hottest.entropy.toFixed(2)}. Packed or encrypted programs light up near-white — this one has nothing to hide.`,
      highlight: range(hottest),
    })
  }

  if (b && b.imports.length) {
    const notable = caps.filter((c) => c.notable)
    const fn = notable[0]?.functions[0]
    const detail =
      fn === 'IsDebuggerPresent'
        ? ` One stands out: IsDebuggerPresent, a classic anti-analysis check. Here it's harmless — Microsoft's C runtime, linked into nearly every Windows program, calls it when reporting a crash.`
        : fn
          ? ` One stands out: ${fn}, flagged as ${notable[0].tag.toLowerCase()}.`
          : ''
    steps.push({
      id: 'capabilities',
      title: 'Read what it asks the OS for',
      body: `It imports ${b.imports.length} functions from ${b.libraries.length} libraries, and those names say what it can do without running it.${detail}`,
      highlight: null,
    })
  }

  if (report.stringCount) {
    const scrubbed = paths.some((p) => p.startsWith('~'))
    const pathNote = paths.length
      ? ` ${pathStrings.length} of them contain source file paths: Rust keeps them for panic messages, which is how binaries quietly reveal the machine they were built on.${scrubbed ? ' (This one was built with its home directory rewritten to ~.)' : ''}`
      : ''
    // Light up the section the paths live in (usually read-only data), else the first string.
    const anchor = pathStrings[0] ?? report.strings[0]
    const home = b && anchor ? sectionAt(b.sections, anchor.offset) : undefined
    steps.push({
      id: 'strings',
      title: 'Read the text it carries',
      body: `${report.stringCount.toLocaleString()} readable strings survive in the file.${pathNote}`,
      highlight: home ? range(home) : anchor ? { start: anchor.offset, end: anchor.offset + 1 } : null,
    })
  }

  return { steps, caps, paths }
}
