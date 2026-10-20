import { useState, type ReactNode } from 'react'
import type { BinaryInfo, Hashes, Report } from '../types'
import type { Finding, Verdict } from '../lib/findings'
import { entropyColor, formatBytes } from '../lib/format'

const PLATFORM: Record<BinaryInfo['format'], string> = { pe: 'Windows', elf: 'Linux', macho: 'macOS' }
const FORMAT: Record<BinaryInfo['format'], string> = { pe: 'PE', elf: 'ELF', macho: 'Mach-O' }

export function describe(report: Report): string {
  const b = report.binary
  if (!b) return `${formatBytes(report.size)}, not an executable glassbin can read.`
  const kind = b.dotnet ? '.NET program' : 'program'
  return `${b.is64 ? '64' : '32'}-bit ${PLATFORM[b.format]} ${kind} (${FORMAT[b.format]}, ${b.arch.toLowerCase()}), ${formatBytes(report.size)}`
}

interface HeaderProps {
  name: string
  report: Report
  hashes: Hashes
  verdict: Verdict
  ms: number
}

/** The top of a report: what the file is, the verdict, and the hashes to look it up by. */
export function ReportHeader({ name, report, hashes, verdict, ms }: HeaderProps) {
  const b = report.binary
  const built = b?.buildTime ? new Date(b.buildTime * 1000) : null
  const plausible = built && built.getUTCFullYear() >= 1995 && built <= new Date()

  return (
    <header className="report-head">
      <div className="report-title">
        <h1>{name}</h1>
        <p>{describe(report)}</p>
      </div>

      <div className={`verdict verdict--${verdict.severity}`} role="status">
        <span className="verdict-dot" aria-hidden="true" />
        <div>
          <strong>{verdict.headline}</strong>
          <p>{verdict.summary}</p>
        </div>
      </div>

      <dl className="facts-row">
        <Fact k="Entropy">
          <span className="swatch" style={{ background: entropyColor(report.entropy) }} />
          {report.entropy.toFixed(2)} <span className="dim">/ 8</span>
        </Fact>
        {b && <Fact k="Imports">{b.imports.length}</Fact>}
        {b?.signed != null && <Fact k="Signature">{b.signed ? 'Present' : 'None'}</Fact>}
        {plausible && <Fact k="Built">{built!.toISOString().slice(0, 10)}</Fact>}
        <Fact k="Read in">{ms < 10 ? ms.toFixed(1) : Math.round(ms)} ms</Fact>
      </dl>

      <div className="hashes">
        <Hash label="SHA-256" value={hashes.sha256} />
        <Hash label="SHA-1" value={hashes.sha1} />
        <a
          className="btn btn--small"
          href={`https://www.virustotal.com/gui/file/${hashes.sha256}`}
          target="_blank"
          rel="noreferrer"
          title="Opens VirusTotal with this file's SHA-256. Only the hash is sent, never the file."
        >
          Look up on VirusTotal ↗
        </a>
      </div>
    </header>
  )
}

function Fact({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div>
      <dt>{k}</dt>
      <dd className="mono">{children}</dd>
    </div>
  )
}

function Hash({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1400)
    } catch {
      /* clipboard blocked: the value is still selectable */
    }
  }
  return (
    <div className="hash">
      <span className="hash-label">{label}</span>
      <code className="hash-value">{value}</code>
      <button className="hash-copy" onClick={copy} aria-label={`Copy ${label}`}>
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  )
}

const SEVERITY_LABEL = { alert: 'High', warn: 'Check', info: 'Note' } as const

export function FindingsList({ findings, onShow }: { findings: Finding[]; onShow: (f: Finding) => void }) {
  if (!findings.length) return <p className="muted">Nothing to report.</p>
  return (
    <ul className="findings">
      {findings.map((f, i) => (
        <li key={i} className={`finding finding--${f.severity}`}>
          <span className="finding-sev">{SEVERITY_LABEL[f.severity]}</span>
          <div className="finding-body">
            <strong>{f.title}</strong>
            <p>{f.detail}</p>
            {f.range && (
              <button className="link-btn" onClick={() => onShow(f)}>
                Show these bytes
              </button>
            )}
          </div>
        </li>
      ))}
    </ul>
  )
}

export function ProtectionList({ binary }: { binary: BinaryInfo }) {
  if (!binary.protections.length) return <p className="muted">No mitigation flags to read for this format.</p>
  return (
    <ul className="protections">
      {binary.protections.map((p) => (
        <li key={p.name} className={p.enabled ? 'is-on' : 'is-off'}>
          <span className="prot-mark" aria-hidden="true">
            {p.enabled ? '✓' : '✕'}
          </span>
          <div>
            <strong>
              {p.name} <span className="sr-only">{p.enabled ? 'enabled' : 'missing'}</span>
            </strong>
            <p>{p.about}</p>
          </div>
        </li>
      ))}
    </ul>
  )
}
