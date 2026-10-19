import { useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import type { ByteRange, Report } from './types'
import { analyzeFile, loadWasm } from './lib/wasm'
import { DropZone } from './components/DropZone'
import { Stats } from './components/Stats'
import { EntropyMap } from './components/EntropyMap'
import { SectionMap } from './components/SectionMap'
import { Capabilities, Imports } from './components/Imports'
import { Strings } from './components/Strings'

gsap.registerPlugin(useGSAP)

type State =
  | { status: 'idle' }
  | { status: 'busy' }
  | { status: 'done'; name: string; report: Report; ms: number }
  | { status: 'error'; message: string }

const SAMPLE_URL = '/samples/binscope-cli.exe'

export default function App() {
  const [state, setState] = useState<State>({ status: 'idle' })
  const [hovered, setHovered] = useState<number | null>(null)
  const [pinned, setPinned] = useState<number | null>(null)
  const resultsRef = useRef<HTMLDivElement>(null)

  // Start fetching the WASM module right away, so the first analysis feels instant.
  useEffect(() => {
    loadWasm()
  }, [])

  const run = async (name: string, file: Blob) => {
    setState({ status: 'busy' })
    setHovered(null)
    setPinned(null)
    try {
      const { report, ms } = await analyzeFile(file)
      setState({ status: 'done', name, report, ms })
    } catch (e) {
      setState({ status: 'error', message: e instanceof Error ? e.message : String(e) })
    }
  }

  const runSample = async () => {
    const res = await fetch(SAMPLE_URL)
    if (!res.ok) return setState({ status: 'error', message: 'Sample binary not found — run `npm run sample`.' })
    run('binscope-cli.exe', await res.blob())
  }

  const report = state.status === 'done' ? state.report : null
  const sections = report?.binary?.sections ?? []
  const activeIdx = hovered ?? pinned
  const active = activeIdx !== null ? sections[activeIdx] : undefined
  const highlight: ByteRange | null = active ? { start: active.fileOffset, end: active.fileOffset + active.fileSize } : null

  // Panels rise in one after another whenever a new report arrives.
  useGSAP(
    () => {
      if (!report) return
      gsap.from('.panel', { y: 28, opacity: 0, duration: 0.7, stagger: 0.08, ease: 'power3.out' })
      gsap.from('.seg', { scaleX: 0, transformOrigin: 'left center', duration: 0.6, stagger: 0.04, ease: 'power2.out', delay: 0.25 })
    },
    { scope: resultsRef, dependencies: [report] },
  )

  return (
    <div className="app">
      <section className={`hero ${report ? 'hero--compact' : ''}`}>
        <h1>
          bin<span className="accent">scope</span>
        </h1>
        <p className="tagline">
          See inside any executable. Written in Rust, running in your browser through WebAssembly —
          <strong> your file never leaves this tab.</strong>
        </p>
      </section>

      <DropZone
        compact={!!report}
        busy={state.status === 'busy'}
        onFile={(f) => run(f.name, f)}
        onSample={runSample}
      />

      {state.status === 'error' && <p className="error">{state.message}</p>}

      {state.status === 'done' && report && (
        <div className="results" ref={resultsRef}>
          <Stats name={state.name} report={report} ms={state.ms} />

          <section className="panel">
            <PanelHead
              title="Entropy map"
              hint={`Each cell is ${report.blockSize.toLocaleString()} bytes. Bright = random-looking data (compressed or encrypted). Hover to inspect.`}
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
            <PanelHead title="Strings" hint="Readable text embedded in the file — messages, URLs, paths, names." />
            <Strings strings={report.strings} total={report.stringCount} />
          </section>
        </div>
      )}

      <footer className="footer muted">
        Built with Rust · goblin · wasm-bindgen · React · WebGL · GSAP
      </footer>
    </div>
  )
}

function PanelHead({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="panel-head">
      <h3>{title}</h3>
      <p className="muted">{hint}</p>
    </div>
  )
}
