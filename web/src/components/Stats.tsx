import type { Report } from '../types'
import { FORMAT_LABEL, entropyColor, formatBytes } from '../lib/format'

export function Stats({ name, report, ms }: { name: string; report: Report; ms: number }) {
  const b = report.binary

  return (
    <header className="stats panel">
      <div className="stats-title">
        <h2 className="mono">{name}</h2>
        <p className="muted">
          {b ? `${FORMAT_LABEL[b.format]} · ${b.arch} · ${b.is64 ? 64 : 32}-bit` : report.parseError}
        </p>
      </div>
      <dl className="stat-grid">
        <Stat label="size" value={formatBytes(report.size)} />
        <Stat
          label="entropy"
          value={report.entropy.toFixed(2)}
          swatch={entropyColor(report.entropy)}
        />
        {b && <Stat label="sections" value={b.sections.length} />}
        {b && <Stat label="imports" value={b.imports.length} />}
        <Stat label="strings" value={report.stringCount.toLocaleString()} />
        <Stat label="analyzed in" value={`${ms < 10 ? ms.toFixed(1) : Math.round(ms)} ms`} accent />
      </dl>
    </header>
  )
}

function Stat({ label, value, swatch, accent }: { label: string; value: string | number; swatch?: string; accent?: boolean }) {
  return (
    <div className="stat">
      <dt>{label}</dt>
      <dd className={`mono ${accent ? 'accent' : ''}`}>
        {swatch && <span className="swatch" style={{ background: swatch }} />}
        {value}
      </dd>
    </div>
  )
}
