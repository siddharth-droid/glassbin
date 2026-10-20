// Runs the Rust engine off the main thread, so a large or hostile file can't freeze the page.
// One message in (the bytes), one message out (the report or an error).

import init, { analyze } from '../wasm/glassbin_wasm.js'
import type { Hashes, Report } from '../types'

export type WorkerRequest = { id: number; bytes: Uint8Array }
export type WorkerResponse =
  // `bytes` comes back (transferred, not copied) so the page can show the hex view.
  | { id: number; ok: true; report: Report; hashes: Hashes; ms: number; bytes: Uint8Array }
  | { id: number; ok: false; error: string }

const ready = init()
// The DOM lib types `self` as a Window; in a dedicated worker postMessage takes just the message.
type WorkerScope = { postMessage(m: WorkerResponse, transfer?: Transferable[]): void }
const post = (msg: WorkerResponse, transfer: Transferable[] = []) =>
  (self as unknown as WorkerScope).postMessage(msg, transfer)

const hex = (buf: ArrayBuffer) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('')

/** The identifiers analysts paste into VirusTotal or MalwareBazaar. Web Crypto, so it's native-fast. */
async function hashes(bytes: Uint8Array): Promise<Hashes> {
  const data = bytes as Uint8Array<ArrayBuffer>
  const [sha256, sha1] = await Promise.all([crypto.subtle.digest('SHA-256', data), crypto.subtle.digest('SHA-1', data)])
  return { sha256: hex(sha256), sha1: hex(sha1) }
}

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const { id, bytes } = e.data
  try {
    await ready
    const t0 = performance.now()
    const report = analyze(bytes) as Report
    const ms = performance.now() - t0
    post({ id, ok: true, report, hashes: await hashes(bytes), ms, bytes }, [bytes.buffer])
  } catch (err) {
    post({ id, ok: false, error: err instanceof Error ? err.message : String(err) })
  }
}
