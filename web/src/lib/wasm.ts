import type { Hashes, Report } from '../types'
import type { WorkerRequest, WorkerResponse } from './analyzer.worker'

/** Bigger files are refused up front: the bytes are copied into WASM memory, which has limits. */
export const MAX_FILE_BYTES = 256 * 1024 * 1024
/** A file that takes longer than this is treated as hostile (or a parser bug) and abandoned. */
const TIMEOUT_MS = 20_000

export interface Analysis {
  report: Report
  hashes: Hashes
  ms: number
  /** The file's bytes, back from the worker — for the hex view. */
  bytes: Uint8Array
}

/** An error whose message is safe and useful to show to the person as-is. */
export class AnalysisError extends Error {}

interface Pending {
  resolve: (a: Analysis) => void
  reject: (e: Error) => void
  timer: ReturnType<typeof setTimeout>
}

let worker: Worker | null = null
let nextId = 0
const pending = new Map<number, Pending>()

/**
 * Throw away the worker and everything it was doing. After a Rust panic the WASM instance can
 * be left in a broken state, so the only safe recovery is a fresh worker with a fresh module.
 */
function reset(reason: string) {
  worker?.terminate()
  worker = null
  for (const p of pending.values()) {
    clearTimeout(p.timer)
    p.reject(new AnalysisError(reason))
  }
  pending.clear()
}

function getWorker(): Worker {
  if (worker) return worker
  const w = new Worker(new URL('./analyzer.worker.ts', import.meta.url), { type: 'module' })
  w.onmessage = (e: MessageEvent<WorkerResponse>) => {
    const msg = e.data
    const p = pending.get(msg.id)
    if (!p) return
    pending.delete(msg.id)
    clearTimeout(p.timer)
    if (msg.ok) {
      p.resolve({ report: msg.report, hashes: msg.hashes, ms: msg.ms, bytes: msg.bytes })
    } else {
      // Most likely a panic inside the parser on a malformed file. Report it, then start clean.
      console.error('glassbin engine error:', msg.error)
      p.reject(new AnalysisError("The engine hit an internal error on this file, so it couldn't be read. That's a bug in glassbin, not your file."))
      reset('The engine restarted.')
    }
  }
  w.onerror = (e) => {
    console.error('glassbin worker crashed:', e.message)
    reset('The engine crashed while reading this file.')
  }
  worker = w
  return w
}

/** Start the worker (and with it, downloading and compiling the WASM) before it's needed. */
export function loadWasm() {
  getWorker()
}

/**
 * Analyze bytes in the worker. The buffer is handed over without copying and comes back in
 * the result, so use `analysis.bytes` afterwards, not the array you passed in.
 */
export function analyzeBytes(bytes: Uint8Array): Promise<Analysis> {
  const w = getWorker()
  const id = nextId++
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id)
      reject(new AnalysisError(`Gave up after ${TIMEOUT_MS / 1000} seconds. The file may be built to stall analysis tools.`))
      reset('The engine was restarted after a timeout.')
    }, TIMEOUT_MS)
    pending.set(id, { resolve, reject, timer })
    const msg: WorkerRequest = { id, bytes }
    w.postMessage(msg, [bytes.buffer])
  })
}

export async function analyzeFile(file: Blob): Promise<Analysis> {
  if (file.size > MAX_FILE_BYTES) {
    const mb = (n: number) => `${Math.round(n / 1024 / 1024)} MB`
    throw new AnalysisError(`This file is ${mb(file.size)}. glassbin reads files up to ${mb(MAX_FILE_BYTES)} in the browser.`)
  }
  if (file.size === 0) throw new AnalysisError('This file is empty.')
  return analyzeBytes(new Uint8Array(await file.arrayBuffer()))
}
