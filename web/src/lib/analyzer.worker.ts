// Runs the Rust engine off the main thread, so a large or hostile file can't freeze the page.
// One message in (the bytes), one message out (the report or an error).

import init, { analyze } from '../wasm/glassbin_wasm.js'
import type { Report } from '../types'

export type WorkerRequest = { id: number; bytes: Uint8Array }
export type WorkerResponse =
  | { id: number; ok: true; report: Report; ms: number }
  | { id: number; ok: false; error: string }

const ready = init()
// The DOM lib types `self` as a Window; in a dedicated worker postMessage takes just the message.
const post = (msg: WorkerResponse) => (self as unknown as { postMessage(m: WorkerResponse): void }).postMessage(msg)

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const { id, bytes } = e.data
  try {
    await ready
    const t0 = performance.now()
    const report = analyze(bytes) as Report
    post({ id, ok: true, report, ms: performance.now() - t0 })
  } catch (err) {
    post({ id, ok: false, error: err instanceof Error ? err.message : String(err) })
  }
}
