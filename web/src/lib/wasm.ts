import init, { analyze } from '../wasm/binscope_wasm.js'
import type { Report } from '../types'

let ready: Promise<unknown> | null = null

/** Download and compile the WASM module once; later calls reuse the same promise. */
export function loadWasm() {
  ready ??= init()
  return ready
}

export async function analyzeFile(file: Blob): Promise<{ report: Report; ms: number }> {
  await loadWasm()
  const bytes = new Uint8Array(await file.arrayBuffer())
  const t0 = performance.now()
  const report = analyze(bytes) as Report
  return { report, ms: performance.now() - t0 }
}
