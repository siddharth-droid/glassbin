import { useRef, useState } from 'react'
import type { ByteRange, Report } from '../types'
import { gsap, prefersReducedMotion, useGSAP } from '../lib/motion'
import { Stats } from '../components/Stats'
import { EntropyMap } from '../components/EntropyMap'
import { SectionMap } from '../components/SectionMap'
import { Capabilities, Imports } from '../components/Imports'
import { Strings } from '../components/Strings'
import { Glyph } from '../landing/Glyph'

interface Props {
  name: string
  report: Report
  ms: number
  onOpen: () => void
  onHome: () => void
}

export function Workspace({ name, report, ms, onOpen, onHome }: Props) {
  const [hovered, setHovered] = useState<number | null>(null)
  const [pinned, setPinned] = useState<number | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  const sections = report.binary?.sections ?? []
  const activeIdx = hovered ?? pinned
  const active = activeIdx !== null ? sections[activeIdx] : undefined
  const highlight: ByteRange | null = active ? { start: active.fileOffset, end: active.fileOffset + active.fileSize } : null

  // A quick settle-in when a new report arrives; the heatmap has its own sweep.
  useGSAP(
    () => {
      if (prefersReducedMotion()) return
      gsap.from('.panel', { opacity: 0, y: 10, duration: 0.45, stagger: 0.05, ease: 'power2.out' })
    },
    { scope: rootRef, dependencies: [report] },
  )

  return (
    <div className="workspace" ref={rootRef}>
      <header className="nav nav--workspace">
        <button className="wordmark" onClick={onHome}>
          <Glyph />
          glassbin
        </button>
        <button className="btn btn--small" onClick={onOpen}>
          Open another file
        </button>
      </header>

      <div className="results">
        <Stats name={name} report={report} ms={ms} />

        <section className="panel">
          <PanelHead
            title="Entropy map"
            hint={`Each cell is ${report.blockSize.toLocaleString()} bytes. Brighter means more random: compressed or encrypted data glows. Hover a cell to inspect it.`}
          />
          <EntropyMap blocks={report.blocks} blockSize={report.blockSize} sections={sections} highlight={highlight} />
        </section>

        {report.binary && (
          <>
            <section className="panel">
              <PanelHead title="Sections" hint="How the file is laid out. Hover or click a section to light it up on the map." />
              <SectionMap
                sections={sections}
                fileSize={report.size}
                active={activeIdx}
                pinned={pinned}
                onHover={setHovered}
                onPin={setPinned}
              />
            </section>

            <div className="two-col">
              <section className="panel">
                <PanelHead title="Capabilities" hint="What it can do, inferred from the system functions it imports." />
                <Capabilities binary={report.binary} />
              </section>
              <section className="panel">
                <PanelHead
                  title="Imports"
                  hint={`${report.binary.imports.length} functions from ${report.binary.libraries.length} libraries.`}
                />
                <Imports binary={report.binary} />
              </section>
            </div>
          </>
        )}

        <section className="panel">
          <PanelHead title="Strings" hint="Readable text embedded in the file: messages, URLs, paths, names." />
          <Strings strings={report.strings} total={report.stringCount} />
        </section>
      </div>
    </div>
  )
}

function PanelHead({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="panel-head">
      <h2>{title}</h2>
      <p>{hint}</p>
    </div>
  )
}
