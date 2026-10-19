import { useCallback, useEffect, useRef, useState } from 'react'
import { analyzeBytes, analyzeFile, loadWasm, type Analysis } from './lib/wasm'
import { SAMPLE_NAME, SAMPLE_URL } from './lib/site'
import { Landing, type Sample } from './landing/Landing'
import { Workspace } from './workspace/Workspace'

type View =
  | { kind: 'landing' }
  | { kind: 'busy'; name: string }
  | ({ kind: 'report'; name: string } & Analysis)
  | { kind: 'error'; message: string }

export default function App() {
  const [view, setView] = useState<View>({ kind: 'landing' })
  const [sample, setSample] = useState<Sample | null>(null)
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Analyze the sample on load: the landing page is built from this live result.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      await loadWasm()
      const res = await fetch(SAMPLE_URL)
      if (!res.ok) return
      const bytes = new Uint8Array(await res.arrayBuffer())
      const analysis = await analyzeBytes(bytes)
      if (!cancelled) setSample({ ...analysis, bytes })
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const show = useCallback((next: View) => {
    setView(next)
    window.scrollTo(0, 0)
  }, [])

  const openFile = useCallback(
    async (name: string, file: Blob) => {
      show({ kind: 'busy', name })
      try {
        const analysis = await analyzeFile(file)
        show({ kind: 'report', name, ...analysis })
        if (location.hash !== '#report') history.pushState(null, '', '#report')
      } catch (e) {
        show({ kind: 'error', message: e instanceof Error ? e.message : String(e) })
      }
    },
    [show],
  )

  // Browser back from a report returns to the landing page.
  useEffect(() => {
    const onPop = () => location.hash !== '#report' && show({ kind: 'landing' })
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
  const openSample = () => sample && openFile(SAMPLE_NAME, new Blob([sample.bytes as BlobPart]))
  const home = () => {
    if (location.hash === '#report') history.back()
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

      {view.kind === 'landing' && <Landing sample={sample} onOpen={open} onSample={openSample} />}
      {view.kind === 'report' && (
        <Workspace name={view.name} report={view.report} ms={view.ms} onOpen={open} onHome={home} />
      )}
      {view.kind === 'busy' && <div className="status">Reading {view.name}…</div>}
      {view.kind === 'error' && (
        <div className="status status--error">
          <p>Couldn't analyze that file: {view.message}</p>
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
