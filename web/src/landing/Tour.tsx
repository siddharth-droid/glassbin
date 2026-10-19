import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import type { Report } from '../types'
import { EntropyMap } from '../components/EntropyMap'
import { SectionMap } from '../components/SectionMap'
import { entropyColor, formatBytes } from '../lib/format'
import { prefersReducedMotion } from '../lib/motion'
import { buildTour, type TourPanel } from './tourSteps'

interface Props {
  report: Report
  fileName: string
}

/** How long each step stays up while the tour plays itself. */
const STEP_MS = 7000

/**
 * A stepper: every step is listed at once, the live glassbin view sits beside them and lights
 * up whatever the active step describes. It plays through on its own while it's on screen —
 * a filling line shows the time left — pauses while you point at it, and stops for good the
 * moment you pick a step yourself.
 */
export function Tour({ report, fileName }: Props) {
  const { steps, caps, paths } = useMemo(() => buildTour(report, fileName), [report, fileName])
  const [active, setActive] = useState(0)
  const [autoplay, setAutoplay] = useState(() => !prefersReducedMotion())
  const [inView, setInView] = useState(false)
  const [hovering, setHovering] = useState(false)
  // On phones the map shares the screen with the step text, so it packs into fewer rows.
  const [narrow] = useState(() => window.matchMedia('(max-width: 900px)').matches)
  const rootRef = useRef<HTMLDivElement>(null)
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])

  // Only play while the tour is actually on screen, so it starts from step one when you arrive.
  useEffect(() => {
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: 0.35 })
    io.observe(rootRef.current!)
    return () => io.disconnect()
  }, [])

  const choose = (i: number) => {
    setActive(i)
    setAutoplay(false)
  }

  // Arrow keys move between steps, as in any tab list.
  const onKeyDown = (e: KeyboardEvent) => {
    const delta = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0
    if (!delta) return
    e.preventDefault()
    const next = (active + delta + steps.length) % steps.length
    choose(next)
    tabRefs.current[next]?.focus()
  }

  const step = steps[active] ?? steps[0]
  const sections = report.binary?.sections ?? []
  const pinnedSection = step.highlight
    ? sections.findIndex((s) => s.fileOffset === step.highlight!.start && s.fileSize > 0)
    : -1

  return (
    <div
      className="tour"
      ref={rootRef}
      onPointerEnter={() => setHovering(true)}
      onPointerLeave={() => setHovering(false)}
    >
      <ol className="tour-steps" role="tablist" aria-orientation="vertical" aria-label="Walkthrough steps">
        {steps.map((s, i) => {
          const on = i === active
          return (
            <li key={s.id} className={`tour-step ${on ? 'is-active' : ''}`}>
              <button
                ref={(el) => {
                  tabRefs.current[i] = el
                }}
                role="tab"
                id={`tour-tab-${s.id}`}
                aria-selected={on}
                aria-controls="tour-stage"
                tabIndex={on ? 0 : -1}
                onClick={() => choose(i)}
                onKeyDown={onKeyDown}
              >
                {s.title}
              </button>
              <div className="tour-step-body" hidden={!on}>
                <p>{s.body}</p>
              </div>
              {on && autoplay && (
                // A CSS animation is the timer: when the line finishes filling, move on.
                <span
                  key={active}
                  className="tour-timer"
                  style={{
                    animationDuration: `${STEP_MS}ms`,
                    animationPlayState: inView && !hovering ? 'running' : 'paused',
                  }}
                  onAnimationEnd={() => setActive((a) => (a + 1) % steps.length)}
                  aria-hidden="true"
                />
              )}
            </li>
          )
        })}
      </ol>

      <div className="tour-stage" id="tour-stage" role="tabpanel" aria-labelledby={`tour-tab-${step.id}`}>
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
