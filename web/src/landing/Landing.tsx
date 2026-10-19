import { useEffect, useRef, useState } from 'react'
import type { Analysis } from '../lib/wasm'
import { formatBytes } from '../lib/format'
import { REPO_URL, SAMPLE_NAME } from '../lib/site'
import { gsap, prefersReducedMotion, useGSAP } from '../lib/motion'
import { ByteField } from './ByteField'
import { Tour } from './Tour'
import { Glyph } from './Glyph'

export interface Sample extends Analysis {
  bytes: Uint8Array
}

interface Props {
  sample: Sample | null
  onOpen: () => void
  onSample: () => void
}

export function Landing({ sample, onOpen, onSample }: Props) {
  const heroRef = useRef<HTMLElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  useGSAP(
    () => {
      if (prefersReducedMotion()) return
      // The headline decodes out of hex, the way glassbin turns bytes into meaning.
      const h1 = rootRef.current!.querySelector('h1')!
      gsap.to(h1, {
        duration: 1.4,
        scrambleText: { text: h1.dataset.text!, chars: '0123456789abcdef', revealDelay: 0.25, speed: 0.5 },
      })
      // Connector lines in the engine diagram draw themselves once, when they come into view.
      gsap.from('.engine-wire path', {
        strokeDashoffset: (_, el: SVGPathElement) => el.getTotalLength(),
        strokeDasharray: (_, el: SVGPathElement) => el.getTotalLength(),
        duration: 0.9,
        ease: 'power2.inOut',
        stagger: 0.12,
        scrollTrigger: { trigger: '.engine', start: 'top 70%' },
      })
    },
    { scope: rootRef },
  )

  const headline = 'See what a program is made of.'

  return (
    <div className="landing" ref={rootRef} id="top">
      <header className="nav">
        <a className="wordmark" href="#top">
          <Glyph />
          glassbin
        </a>
        <nav aria-label="Sections">
          <a href="#how">How it reads a file</a>
          <a href="#cli">CLI</a>
          <a href={REPO_URL}>Source</a>
        </nav>
        <button className="btn btn--small" onClick={onOpen}>
          Open a file
        </button>
      </header>

      <section className="hero" ref={heroRef}>
        <h1 data-text={headline} aria-label={headline}>
          {headline}
        </h1>
        <div className="hero-body">
          <p className="lede">
            Drop in any Windows, Linux or macOS executable. glassbin maps its sections, imports, strings and
            entropy right here in the tab. It's written in Rust, compiled to WebAssembly, and your file is
            never uploaded.
          </p>
          <div className="hero-actions">
            <button className="btn btn--primary" onClick={onOpen}>
              Open a file…
            </button>
            <button className="btn" onClick={onSample} disabled={!sample}>
              Analyze {SAMPLE_NAME}
            </button>
          </div>
          <p className="hint">Or drag a file anywhere onto this page.</p>
        </div>

        <figure className="hero-figure">
          <div className="bytefield-wrap">
            {sample ? <ByteField bytes={sample.bytes} report={sample.report} triggerRef={heroRef} /> : <div className="bytefield-placeholder" />}
          </div>
          <figcaption>
            {sample ? (
              <>
                Every byte of {SAMPLE_NAME}, {formatBytes(sample.report.size)}, read by this page in{' '}
                <strong>{Math.round(sample.ms)} ms</strong> when it loaded. Scroll to turn the bytes into an entropy map,
                or point at them.
              </>
            ) : (
              'Loading the Rust engine…'
            )}
          </figcaption>
        </figure>
      </section>

      <section className="block" id="how">
        <div className="block-head">
          <h2>How it reads a file</h2>
          <p>
            The questions an analyst asks of any unknown program, answered from the bytes of {SAMPLE_NAME}. Nothing on
            the right is a screenshot; it's the same engine, running now.
          </p>
        </div>
        {sample ? <Tour report={sample.report} fileName={SAMPLE_NAME} /> : <div className="tour-placeholder" />}
      </section>

      <section className="block engine">
        <div className="block-head">
          <h2>One Rust engine, three ways in</h2>
          <p>
            All the analysis lives in one library, <code>glassbin-core</code>. Everything else is a thin shell around
            it, so the browser, the terminal and the server always agree.
          </p>
        </div>
        <div className="engine-diagram">
          <div className="engine-core">
            <code className="engine-name">glassbin-core</code>
            <pre className="engine-sig">
              <code>{'pub fn parse(bytes: &[u8])\n  -> Result<BinaryInfo, ParseError>'}</code>
            </pre>
            <p>PE, ELF and Mach-O parsing with goblin, plus entropy and string extraction. It never touches the disk or the network; it only reads the bytes it's handed.</p>
          </div>
          <svg className="engine-wire" viewBox="0 0 100 300" preserveAspectRatio="none" aria-hidden="true">
            <path d="M0 150 C 50 150, 50 50, 100 50" />
            <path d="M0 150 L 100 150" />
            <path d="M0 150 C 50 150, 50 250, 100 250" />
          </svg>
          <ul className="engine-targets">
            <li>
              <strong>This page</strong>
              <span>Compiled to WebAssembly with wasm-bindgen. Your file goes into the module's memory, and nowhere else.</span>
            </li>
            <li>
              <strong>Your terminal</strong>
              <span>The <code>glassbin</code> CLI prints the same report, ready for scripts and CI.</span>
            </li>
            <li>
              <strong>A server</strong>
              <span>
                An Axum API that asks Claude to explain a function in plain English. <em>In progress.</em>
              </span>
            </li>
          </ul>
        </div>
      </section>

      <section className="block" id="cli">
        <div className="block-head">
          <h2>Same engine in your terminal</h2>
          <p>Build it from source with Cargo, then point it at anything.</p>
        </div>
        <Cli />
      </section>

      <section className="block">
        <div className="block-head">
          <h2>Your file stays here</h2>
          <p>
            You don't have to take our word for it. Below is every request this page has made, read live from your
            browser. Analyze a file, come back, and it's the same list.
          </p>
        </div>
        <NetworkLog />
      </section>

      <section className="closing">
        <h2>Got a binary you're curious about?</h2>
        <div className="hero-actions">
          <button className="btn btn--primary" onClick={onOpen}>
            Open a file…
          </button>
          <a className="btn" href={REPO_URL}>
            Read the source
          </a>
        </div>
      </section>

      <footer className="footer">
        <span>glassbin is open source under the MIT licence.</span>
        <span>Built with Rust, goblin, wasm-bindgen, React, WebGL and GSAP.</span>
      </footer>
    </div>
  )
}

const INSTALL = `git clone ${REPO_URL}
cargo install --path glassbin/crates/cli
glassbin ./program.exe`

// Real output from running the CLI on the sample binary, trimmed.
const OUTPUT = `file      glassbin.exe
size      557568 bytes
entropy   6.310 bits/byte
format    PE (Windows) · X86_64 · 64-bit
entry     0x67740

sections (5):
  name        offset       size  entropy
  .text        0x400     430592     6.22  code / binary data
  .rdata     0x69600     109568     5.65  code / binary data
  .data      0x84200        512     2.03  mostly padding
  .pdata     0x84400      13824     5.77  code / binary data
  .reloc     0x87a00       2048     5.37  text / structured data

imports   98 functions from 11 libraries
  KERNEL32.dll           SetUnhandledExceptionFilter, IsDebuggerPresent, +53 more
  bcryptprimitives.dll   ProcessPrng
  ntdll.dll              NtWriteFile, NtReadFile, RtlNtStatusToDosError`

function Cli() {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(INSTALL)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      /* clipboard unavailable — the text is still selectable */
    }
  }
  return (
    <div className="cli">
      <div className="cli-install">
        <pre>
          <code>{INSTALL}</code>
        </pre>
        <button className="btn btn--small" onClick={copy}>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="cli-output">
        <code>{OUTPUT}</code>
      </pre>
    </div>
  )
}

// Resource Timing's initiatorType, in words. Fonts are requested by stylesheets ("css").
const KIND: Record<string, string> = {
  script: 'Script',
  link: 'Stylesheet',
  css: 'Font',
  fetch: 'Fetch',
  img: 'Image',
  other: 'Other',
}

interface Entry {
  name: string
  kind: string
  bytes: number
}

/** Every network request this document has made, from the browser's own Resource Timing API. */
function NetworkLog() {
  const [entries, setEntries] = useState<Entry[]>([])

  useEffect(() => {
    const toEntry = (e: PerformanceResourceTiming): Entry => {
      const url = new URL(e.name)
      const file = url.pathname.split('/').pop() || url.host
      return {
        name: url.host === location.host ? file : `${url.host}/…/${file}`,
        kind: KIND[e.initiatorType] ?? e.initiatorType,
        bytes: e.decodedBodySize,
      }
    }
    const read = () =>
      setEntries((performance.getEntriesByType('resource') as PerformanceResourceTiming[]).map(toEntry))
    read()
    const po = new PerformanceObserver(read)
    po.observe({ type: 'resource', buffered: true })
    return () => po.disconnect()
  }, [])

  return (
    <div className="netlog">
      <table>
        <thead>
          <tr>
            <th>Request</th>
            <th>Type</th>
            <th className="num">Size</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e, i) => (
            <tr key={i}>
              <td className="mono">{e.name}</td>
              <td className="dim">{e.kind}</td>
              <td className="mono num">{e.bytes ? formatBytes(e.bytes) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="netlog-foot">
        {entries.length} requests, every one fetching this site's own files. Analyze something and the count stays put.
      </p>
    </div>
  )
}
