import init, { analyze } from '../wasm/binscope_wasm.js'
import type { Report } from '../types'

let ready: Promise<unknown> | null = null

/** Download and compile the WASM module once; later calls reuse the same promise. */
export function loadWasm() {
  ready ??= init()
  return ready
}

export interface Analysis {
  report: Report
  ms: number
}

export async function analyzeBytes(bytes: Uint8Array): Promise<Analysis> {
  await loadWasm()
  const t0 = performance.now()
  const report = analyze(bytes) as Report
  return { report, ms: performance.now() - t0 }
}

export async function analyzeFile(file: Blob): Promise<Analysis> {
  return analyzeBytes(new Uint8Array(await file.arrayBuffer()))
}
