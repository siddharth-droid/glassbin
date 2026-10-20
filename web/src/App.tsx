import { useCallback, useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { AnalysisError, analyzeBytes, analyzeFile, loadWasm, type Analysis } from './lib/wasm'
import { prefersReducedMotion } from './lib/motion'
import { SAMPLES, sampleUrl } from './lib/site'
import { Landing, type Preview } from './landing/Landing'
import { Workspace } from './workspace/Workspace'

type View =
  | { kind: 'landing' }
  | { kind: 'busy'; name: string }
  | { kind: 'report'; name: string; analysis: Analysis }
  | { kind: 'error'; message: string }

/** Give an open report its own history entry, so the browser's Back button closes it. */
function pushReport() {
  if (!history.state?.report) history.pushState({ report: true }, '', '#file')
}

export default function App() {
  const [view, setView] = useState<View>({ kind: 'landing' })
  const [preview, setPreview] = useState<Preview | null>(null)
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Analyze the first sample on load: the landing page's report preview is this live result.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      loadWasm()
      const name = SAMPLES[0].file
      const res = await fetch(sampleUrl(name))
      if (!res.ok) return
      const analysis = await analyzeBytes(new Uint8Array(await res.arrayBuffer()))
      if (!cancelled) setPreview({ name, analysis })
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // Switch views inside a View Transition (a native crossfade) where the browser supports it.
  // `flushSync` makes React render synchronously, so the browser can snapshot the new view.
  // The current view's kind, readable from event listeners without re-subscribing.
  const viewRef = useRef<View['kind']>('landing')
  viewRef.current = view.kind

  const show = useCallback((next: View) => {
    const apply = () => {
      flushSync(() => setView(next))
      // "instant": the page sets `scroll-behavior: smooth`, which would otherwise animate this jump.
      window.scrollTo({ top: 0, behavior: 'instant' })
    }
    // The brief "busy" state isn't worth animating, and a transition into it would only be
    // interrupted by the next one.
    if (!document.startViewTransition || prefersReducedMotion() || next.kind === 'busy') return apply()
    const transition = document.startViewTransition(apply)
    // A transition interrupted by a newer one rejects these promises; that's expected, not an error.
    const ignore = () => {}
    transition.ready.catch(ignore)
    transition.finished.catch(ignore)
  }, [])

  const openFile = useCallback(
    async (name: string, file: Blob) => {
      show({ kind: 'busy', name })
      try {
        const analysis = await analyzeFile(file)
        show({ kind: 'report', name, analysis })
        pushReport()
      } catch (e) {
        const message =
          e instanceof AnalysisError
            ? e.message
            : `Couldn't analyze that file: ${e instanceof Error ? e.message : String(e)}`
        show({ kind: 'error', message })
      }
    },
    [show],
  )

  // Browser back from a report returns to the landing page.
  useEffect(() => {
    // Going back past a report (or an error shown over one) returns to the landing page.
    // In-page links (#cli, #privacy) also fire popstate while on the landing page; those are
    // left alone so the browser can scroll to them.
    const onPop = () => {
      if (!history.state?.report && viewRef.current !== 'landing') show({ kind: 'landing' })
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [show])

  // Drop a file anywhere on the page.
  useEffect(() => {
    let depth = 0
    const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes('Files')
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return
      depth++
      setDragging(true)
    }
    const leave = () => {
      depth = Math.max(0, depth - 1)
      if (depth === 0) setDragging(false)
    }
    const over = (e: DragEvent) => hasFiles(e) && e.preventDefault()
    const drop = (e: DragEvent) => {
      e.preventDefault()
      depth = 0
      setDragging(false)
      const file = e.dataTransfer?.files[0]
      if (file) openFile(file.name, file)
    }
    window.addEventListener('dragenter', enter)
    window.addEventListener('dragleave', leave)
    window.addEventListener('dragover', over)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragenter', enter)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('dragover', over)
      window.removeEventListener('drop', drop)
    }
  }, [openFile])

  const open = () => inputRef.current?.click()
  const openSample = async (file: string) => {
    // The previewed sample is already analyzed; reuse it.
    if (preview?.name === file) {
      show({ kind: 'report', name: file, analysis: preview.analysis })
      pushReport()
      return
    }
    const res = await fetch(sampleUrl(file))
    if (!res.ok) return show({ kind: 'error', message: `Couldn't load the sample ${file}.` })
    openFile(file, await res.blob())
  }
  const home = () => {
    if (history.state?.report) history.back()
    else show({ kind: 'landing' })
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) openFile(file.name, file)
          e.target.value = '' // allow choosing the same file again
        }}
      />

      {view.kind === 'landing' && <Landing preview={preview} dragging={dragging} onOpen={open} onSample={openSample} />}
      {view.kind === 'report' && <Workspace name={view.name} analysis={view.analysis} onOpen={open} onHome={home} />}
      {view.kind === 'busy' && <div className="status">Reading {view.name}…</div>}
      {view.kind === 'error' && (
        <div className="status status--error">
          <p>{view.message}</p>
          <button className="btn" onClick={home}>
            Back
          </button>
        </div>
      )}

      <div className={`drop-overlay ${dragging ? 'is-on' : ''}`} aria-hidden={!dragging}>
        <p>Drop to analyze. It stays on this device.</p>
      </div>
    </>
  )
}
