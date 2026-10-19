import { useEffect, useMemo, useRef, useState } from 'react'
import type { Report } from '../types'
import { EntropyMap } from '../components/EntropyMap'
import { SectionMap } from '../components/SectionMap'
import { entropyColor, formatBytes } from '../lib/format'
import { buildTour, type TourPanel } from './tourSteps'

interface Props {
  report: Report
  fileName: string
}

/**
 * Scrollytelling walkthrough: step text scrolls on the left, a real binscope view stays
 * pinned on the right and lights up whatever the current step is talking about.
 */
export function Tour({ report, fileName }: Props) {
  const { steps, caps, paths } = useMemo(() => buildTour(report, fileName), [report, fileName])
  const [active, setActive] = useState(0)
  // On phones the map shares the screen with the step text, so it packs into fewer rows.
  const [narrow] = useState(() => window.matchMedia('(max-width: 900px)').matches)
  const stepRefs = useRef<(HTMLElement | null)[]>([])

  // The step crossing the middle band of the viewport is the active one.
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.index))
      },
      { rootMargin: '-45% 0px -45% 0px' },
    )
    stepRefs.current.forEach((el) => el && io.observe(el))
    return () => io.disconnect()
  }, [steps])

  const step = steps[active] ?? steps[0]
  const sections = report.binary?.sections ?? []
  const pinnedSection = step.highlight
    ? sections.findIndex((s) => s.fileOffset === step.highlight!.start && s.fileSize > 0)
    : -1

  return (
    <div className="tour">
      <ol className="tour-steps">
        {steps.map((s, i) => (
          <li
            key={s.id}
            ref={(el) => {
              stepRefs.current[i] = el
            }}
            data-index={i}
            className={`tour-step ${i === active ? 'is-active' : ''}`}
          >
            <h3>{s.title}</h3>
            <p>{s.body}</p>
          </li>
        ))}
      </ol>

      <div className="tour-stage" aria-live="polite">
        <div className="tour-frame">
          <div className="tour-frame-head">
            <span className="mono">{fileName}</span>
            <span className="dim">{formatBytes(report.size)}</span>
          </div>
          <EntropyMap
            blocks={report.blocks}
            blockSize={report.blockSize}
            sections={sections}
            highlight={step.highlight}
            minCellPx={narrow ? 3 : 7}
          />
          <div className="tour-panel" key={step.id}>
            <Panel
              kind={step.id}
              report={report}
              pinned={pinnedSection >= 0 ? pinnedSection : null}
              caps={caps}
              paths={paths}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

function Panel({
  kind,
  report,
  pinned,
  caps,
  paths,
}: {
  kind: TourPanel
  report: Report
  pinned: number | null
  caps: ReturnType<typeof buildTour>['caps']
  paths: string[]
}) {
  const b = report.binary
  switch (kind) {
    case 'overview':
      return (
        <dl className="facts">
          {b && (
            <>
              <Fact k="Format" v={b.format === 'pe' ? 'PE' : b.format === 'elf' ? 'ELF' : 'Mach-O'} />
              <Fact k="Architecture" v={b.arch.toLowerCase()} />
            </>
          )}
          <Fact k="Size" v={formatBytes(report.size)} />
          <Fact k="Entropy" v={report.entropy.toFixed(2)} swatch={entropyColor(report.entropy)} />
        </dl>
      )
    case 'sections':
    case 'packed':
      return b ? (
        <SectionMap
          sections={b.sections}
          fileSize={report.size}
          active={pinned}
          pinned={pinned}
          onHover={() => {}}
          onPin={() => {}}
          compact
        />
      ) : null
    case 'capabilities':
      return (
        <ul className="tour-caps">
          {caps.slice(0, 4).map((c) => (
            <li key={c.tag} className={c.notable ? 'is-notable' : ''}>
              <span>{c.tag}</span>
              <code>{c.functions.slice(0, 2).join(', ')}</code>
            </li>
          ))}
        </ul>
      )
    case 'strings':
      return (
        <ul className="tour-strings mono">
          {(paths.length ? paths : report.strings.map((s) => s.text)).slice(0, 4).map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ul>
      )
  }
}

function Fact({ k, v, swatch }: { k: string; v: string; swatch?: string }) {
  return (
    <div>
      <dt>{k}</dt>
      <dd className="mono">
        {swatch && <span className="swatch" style={{ background: swatch }} />}
        {v}
      </dd>
    </div>
  )
}
