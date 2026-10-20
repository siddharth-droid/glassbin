import { useMemo, useRef, useState, type KeyboardEvent } from 'react'
import type { ByteRange } from '../types'
import type { Analysis } from '../lib/wasm'
import { analyzeFindings, verdictFor } from '../lib/findings'
import { EntropyMap } from '../components/EntropyMap'
import { SectionMap } from '../components/SectionMap'
import { Capabilities, Imports } from '../components/Imports'
import { Strings } from '../components/Strings'
import { HexView } from '../components/HexView'
import { FindingsList, ProtectionList, ReportHeader } from '../components/Summary'
import { Glyph } from '../landing/Glyph'

type Tab = 'overview' | 'imports' | 'strings' | 'hex'

interface Props {
  name: string
  analysis: Analysis
  onOpen: () => void
  onHome: () => void
}

export function Workspace({ name, analysis, onOpen, onHome }: Props) {
  const { report, hashes, ms, bytes } = analysis
  const findings = useMemo(() => analyzeFindings(report), [report])
  const verdict = useMemo(() => verdictFor(findings, report), [findings, report])

  const [tab, setTab] = useState<Tab>('overview')
  const [hovered, setHovered] = useState<number | null>(null)
  const [pinned, setPinned] = useState<number | null>(null)
  const [hexTarget, setHexTarget] = useState<ByteRange | null>(null)
  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({ overview: null, imports: null, strings: null, hex: null })

  const b = report.binary
  const sections = b?.sections ?? []
  const activeIdx = hovered ?? pinned
  const active = activeIdx !== null ? sections[activeIdx] : undefined
  const highlight: ByteRange | null = active ? { start: active.fileOffset, end: active.fileOffset + active.fileSize } : null

  /** Every "show me" in the report leads here. */
  const showBytes = (range: ByteRange) => {
    setHexTarget({ ...range }) // a fresh object, so asking twice for the same place still scrolls
    setTab('hex')
  }

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'overview', label: 'Overview' },
    ...(b ? [{ id: 'imports' as const, label: 'Imports', count: b.imports.length }] : []),
    { id: 'strings', label: 'Strings', count: report.stringCount },
    { id: 'hex', label: 'Hex' },
  ]
  const onTabKey = (e: KeyboardEvent, i: number) => {
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (!d) return
    const next = tabs[(i + d + tabs.length) % tabs.length].id
    setTab(next)
    tabRefs.current[next]?.focus()
  }

  return (
    <div className="workspace">
      <header className="nav nav--workspace">
        <button className="wordmark" onClick={onHome}>
          <Glyph />
          glassbin
        </button>
        <span className="nav-file mono">{name}</span>
        <button className="btn btn--small" onClick={onOpen}>
          Open another file
        </button>
      </header>

      <div className="report">
        <ReportHeader name={name} report={report} hashes={hashes} verdict={verdict} findings={findings} ms={ms} />

        <div className="tabs" role="tablist" aria-label="Report sections">
          {tabs.map((t, i) => (
            <button
              key={t.id}
              ref={(el) => {
                tabRefs.current[t.id] = el
              }}
              role="tab"
              id={`tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls={`panel-${t.id}`}
              tabIndex={tab === t.id ? 0 : -1}
              className={`tab ${tab === t.id ? 'is-on' : ''}`}
              onClick={() => setTab(t.id)}
              onKeyDown={(e) => onTabKey(e, i)}
            >
              {t.label}
              {t.count !== undefined && <span className="count">{t.count.toLocaleString()}</span>}
            </button>
          ))}
        </div>

        <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="tab-panel">
          {tab === 'overview' && (
            <div className="overview">
              <section className="panel">
                <h2 className="panel-title">Findings</h2>
                <FindingsList findings={findings} onShow={(f) => f.range && showBytes(f.range)} />
              </section>

              {b && (
                <section className="panel">
                  <h2 className="panel-title">Exploit protections</h2>
                  <ProtectionList binary={b} />
                </section>
              )}

              <section className="panel panel--wide">
                <div className="panel-title-row">
                  <h2 className="panel-title">Map of the file</h2>
                  <p className="dim">
                    Each cell is {report.blockSize.toLocaleString()} bytes, coloured by randomness. Click one to see its
                    bytes.
                  </p>
                </div>
                <EntropyMap
                  blocks={report.blocks}
                  blockSize={report.blockSize}
                  sections={sections}
                  highlight={highlight}
                  onPick={(offset) => showBytes({ start: offset, end: offset + report.blockSize })}
                />
                {b && sections.length > 0 && (
                  <SectionMap
                    sections={sections}
                    fileSize={report.size}
                    active={activeIdx}
                    pinned={pinned}
                    onHover={setHovered}
                    onPin={setPinned}
                  />
                )}
              </section>
            </div>
          )}

          {tab === 'imports' && b && (
            <div className="overview">
              <section className="panel">
                <h2 className="panel-title">What it can do</h2>
                <p className="panel-lede">Inferred from the operating-system functions it imports, without running it.</p>
                <Capabilities binary={b} />
              </section>
              <section className="panel">
                <h2 className="panel-title">
                  {b.imports.length} functions from {b.libraries.length} libraries
                </h2>
                <Imports binary={b} />
              </section>
            </div>
          )}

          {tab === 'strings' && (
            <section className="panel">
              <Strings
                strings={report.strings}
                total={report.stringCount}
                onShow={(s) => showBytes({ start: s.offset, end: s.offset + s.text.length })}
              />
            </section>
          )}

          {tab === 'hex' && (
            <section className="panel">
              <HexView bytes={bytes} sections={sections} target={hexTarget} />
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
