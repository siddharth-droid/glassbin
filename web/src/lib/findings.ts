import type { ByteRange, Report } from '../types'
import { detectCapabilities, classifyString } from './capabilities'
import { formatBytes } from './format'

// Turn a report into what a person actually wants to know: is anything here worth a look,
// and why. Static analysis can't prove a file safe or malicious, so the wording never claims
// either; it says what was seen and what that usually means.

export type Severity = 'alert' | 'warn' | 'info'

export interface Finding {
  severity: Severity
  title: string
  detail: string
  /** Bytes the finding is about, so the UI can show them on the map or in the hex view. */
  range?: ByteRange
}

export interface Verdict {
  severity: Severity | 'clear'
  headline: string
  summary: string
}

/** Section names left behind by well-known packers and protectors. */
const PACKER_SECTIONS: [RegExp, string][] = [
  [/^UPX\d?$/i, 'UPX'],
  [/^\.aspack$|^\.adata$/i, 'ASPack'],
  [/^\.themida$|^\.winlice$/i, 'Themida'],
  [/^\.vmp\d$/i, 'VMProtect'],
  [/^\.enigma\d$/i, 'Enigma Protector'],
  [/^\.petite$/i, 'Petite'],
  [/^\.mpress\d$/i, 'MPRESS'],
  [/^\.nsp\d$/i, 'NsPack'],
]

/** Entropy at or above this reads as compressed or encrypted. */
const HOT = 7.2

/** Contiguous runs of high-entropy heatmap cells, largest first. */
function hotRuns(report: Report): ByteRange[] {
  const runs: ByteRange[] = []
  let start = -1
  report.blocks.forEach((e, i) => {
    if (e >= HOT && start < 0) start = i
    if ((e < HOT || i === report.blocks.length - 1) && start >= 0) {
      const end = e >= HOT ? i + 1 : i
      runs.push({ start: start * report.blockSize, end: Math.min(end * report.blockSize, report.size) })
      start = -1
    }
  })
  return runs.sort((a, b) => b.end - b.start - (a.end - a.start))
}

export function analyzeFindings(report: Report): Finding[] {
  const out: Finding[] = []
  const b = report.binary

  // ── packing and hidden data ─────────────────────────────────────────
  const runs = hotRuns(report).filter((r) => r.end - r.start >= 4096)
  const hotBytes = runs.reduce((n, r) => n + r.end - r.start, 0)
  if (runs.length) {
    const share = Math.round((hotBytes / report.size) * 100)
    out.push({
      severity: share >= 40 ? 'alert' : 'warn',
      title: share >= 40 ? 'Most of this file looks encrypted or compressed' : 'Contains encrypted or compressed data',
      detail: `${formatBytes(hotBytes)} (${share}% of the file) is close to random. Installers and archives look like this; so do packed programs hiding their real code. The largest block starts at 0x${runs[0].start.toString(16)}.`,
      range: runs[0],
    })
  }

  if (b) {
    for (const s of b.sections) {
      const hit = PACKER_SECTIONS.find(([re]) => re.test(s.name.trim()))
      if (hit) {
        out.push({
          severity: 'alert',
          title: `Packed with ${hit[1]}`,
          detail: `A section named ${s.name} is the signature of ${hit[1]}. The real program is compressed or encrypted inside and only unpacks itself when it runs, so most of what's visible here is the unpacker.`,
          range: { start: s.fileOffset, end: s.fileOffset + s.fileSize },
        })
        break
      }
    }

    if (b.format === 'pe' && !b.dotnet && b.imports.length > 0 && b.imports.length < 12) {
      out.push({
        severity: 'warn',
        title: `Only ${b.imports.length} imported functions`,
        detail: 'Ordinary Windows programs import dozens. A short list, especially with LoadLibrary and GetProcAddress, usually means the program looks up what it needs at run time, a common packer trick.',
      })
    }

    // Data appended after the last section is invisible to the loader: the "overlay".
    const end = Math.max(0, ...b.sections.map((s) => s.fileOffset + s.fileSize))
    const overlay = report.size - end
    if (end > 0 && overlay > 1024) {
      out.push({
        severity: 'warn',
        title: `${formatBytes(overlay)} appended after the program`,
        detail: 'Bytes after the last section are never loaded as part of the program. Installers keep their payload there; signatures live there too; and so does malware that carries a second file.',
        range: { start: end, end: report.size },
      })
    }

    // ── capabilities ─────────────────────────────────────────────────
    const caps = detectCapabilities(b.imports)
    const fn = (tag: string) => caps.find((c) => c.tag === tag)
    const injection = fn('Memory injection')
    if (injection) {
      out.push({
        severity: 'alert',
        title: 'Can write into other programs',
        detail: `Imports ${injection.functions.slice(0, 3).join(', ')}: the toolkit for injecting code into another process. Debuggers and some security tools need this; it's also the core of most malware loaders.`,
      })
    }
    const keys = fn('Keyboard / clipboard')
    if (keys) {
      out.push({
        severity: 'warn',
        title: 'Can watch the keyboard or clipboard',
        detail: `Imports ${keys.functions.slice(0, 3).join(', ')}. Normal for apps with shortcuts or copy-paste; keyloggers rely on the same calls.`,
      })
    }
    const net = fn('Network')
    if (net) {
      out.push({
        severity: 'info',
        title: 'Can talk to the network',
        detail: `Imports ${net.functions.slice(0, 4).join(', ')}. Expected for anything that updates, syncs or downloads.`,
      })
    }
    const anti = fn('Anti-debugging')
    if (anti) {
      out.push({
        severity: 'info',
        title: 'Checks whether it is being debugged',
        detail: `Imports ${anti.functions.join(', ')}. Malware uses this to hide from analysts, but Microsoft's C runtime calls IsDebuggerPresent in nearly every Windows program, so on its own it means little.`,
      })
    }

    // ── how it was built ─────────────────────────────────────────────
    const missing = b.protections.filter((p) => !p.enabled).map((p) => p.name)
    if (missing.length) {
      out.push({
        severity: missing.some((m) => ['ASLR', 'DEP', 'PIE', 'NX stack'].includes(m)) ? 'warn' : 'info',
        title: `Built without ${listOf(missing)}`,
        detail: 'These are exploit mitigations: they make bugs in the program harder to turn into attacks. Modern compilers enable most of them by default, so missing ones point to an old or unusual toolchain.',
      })
    }
    if (b.signed === false) {
      out.push({
        severity: 'info',
        title: 'No digital signature inside',
        detail: "The file doesn't carry an Authenticode signature, so it can't say who published it. Windows' own files are often signed in a separate catalog instead, so this alone isn't suspicious.",
      })
    }
    if (b.buildTime) {
      const year = new Date(b.buildTime * 1000).getUTCFullYear()
      if (year > new Date().getUTCFullYear() || year < 1995) {
        out.push({
          severity: 'info',
          title: 'Build timestamp is not a real date',
          detail: `It reads as ${year}. Reproducible builds write a hash here instead of a time; malware authors sometimes forge it to confuse timelines.`,
        })
      }
    }
    if (b.dotnet) {
      out.push({
        severity: 'info',
        title: 'A .NET program',
        detail: 'Most of its logic is .NET bytecode in one block, so imports and sections say less than usual. A .NET decompiler such as ILSpy will show far more.',
      })
    }
    if (b.stripped) {
      out.push({
        severity: 'info',
        title: 'Symbol names removed',
        detail: 'The symbol table was stripped, as is normal for release builds. Function names would make analysis easier.',
      })
    }
  }

  // ── strings ─────────────────────────────────────────────────────────
  const urls = report.strings.filter((s) => classifyString(s.text) === 'url')
  if (urls.length) {
    const hosts = [...new Set(urls.map((s) => s.text.match(/[a-z]+:\/\/([^/\s"']+)/i)?.[1]).filter(Boolean))]
    out.push({
      severity: 'info',
      title: `Mentions ${urls.length === 1 ? 'a web address' : `${urls.length} web addresses`}`,
      detail: hosts.length ? `Including ${listOf(hosts.slice(0, 3) as string[])}. See the Strings tab for the full text.` : 'See the Strings tab.',
      range: { start: urls[0].offset, end: urls[0].offset + urls[0].text.length },
    })
  }

  const rank: Record<Severity, number> = { alert: 0, warn: 1, info: 2 }
  return out.sort((x, y) => rank[x.severity] - rank[y.severity])
}

export function verdictFor(findings: Finding[], report: Report): Verdict {
  const alerts = findings.filter((f) => f.severity === 'alert').length
  const warns = findings.filter((f) => f.severity === 'warn').length
  if (alerts)
    return {
      severity: 'alert',
      headline: 'Worth a closer look',
      summary: `${count(alerts, 'strong sign')} of packing, hiding or tampering${warns ? `, and ${count(warns, 'thing')} to check` : ''}. That's typical of malware, and of some legitimate protected software.`,
    }
  if (warns)
    return {
      severity: 'warn',
      headline: 'A few things to check',
      summary: `${count(warns, 'finding')} that ordinary programs sometimes have too. Read them before you trust it.`,
    }
  return {
    severity: 'clear',
    headline: report.binary ? 'Nothing unusual' : 'Not a program',
    summary: report.binary
      ? 'No signs of packing, hidden data or risky capabilities. Static checks can’t prove a file is safe, so check the SHA-256 against a reputation service before running anything you don’t trust.'
      : "glassbin couldn't read this as a Windows, Linux or macOS program. Its entropy and strings are below.",
  }
}

const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`
function listOf(items: string[]): string {
  if (items.length < 2) return items.join('')
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}
