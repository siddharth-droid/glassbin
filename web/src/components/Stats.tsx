import type { BinaryInfo, Report } from '../types'
import { entropyColor, formatBytes } from '../lib/format'

const PLATFORM: Record<BinaryInfo['format'], string> = { pe: 'Windows', elf: 'Linux', macho: 'macOS' }
const FORMAT: Record<BinaryInfo['format'], string> = { pe: 'PE', elf: 'ELF', macho: 'Mach-O' }

export function Stats({ name, report, ms }: { name: string; report: Report; ms: number }) {
  const b = report.binary

  return (
    <header className="stats panel">
      <div className="stats-title">
        <h1>{name}</h1>
        <p>
          {b
            ? `A ${b.is64 ? 64 : 32}-bit ${PLATFORM[b.format]} program (${FORMAT[b.format]}) for ${b.arch.toLowerCase()}.`
            : `Not an executable binscope can parse (${report.parseError}). Entropy and strings still apply.`}
        </p>
      </div>
      <dl className="stat-grid">
        <Stat label="Size" value={formatBytes(report.size)} />
        <Stat label="Entropy" value={report.entropy.toFixed(2)} swatch={entropyColor(report.entropy)} />
        {b && <Stat label="Sections" value={b.sections.length} />}
        {b && <Stat label="Imports" value={b.imports.length} />}
        <Stat label="Strings" value={report.stringCount.toLocaleString()} />
        <Stat label="Read in" value={`${ms < 10 ? ms.toFixed(1) : Math.round(ms)} ms`} />
      </dl>
    </header>
  )
}

function Stat({ label, value, swatch }: { label: string; value: string | number; swatch?: string }) {
  return (
    <div className="stat">
      <dt>{label}</dt>
      <dd className="mono">
        {swatch && <span className="swatch" style={{ background: swatch }} />}
        {value}
      </dd>
    </div>
  )
}
