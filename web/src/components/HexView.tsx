import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { ByteRange, Section } from '../types'
import { hex, sectionAt } from '../lib/format'

interface Props {
  bytes: Uint8Array
  sections: Section[]
  /** Scroll here and highlight it. Changes whenever something elsewhere asks to "show in hex". */
  target: ByteRange | null
}

const COLS = 16
const ROW_PX = 22
/**
 * Browsers cap an element's height (~17M px in Firefox), so one scroll area can't hold a 100 MB
 * file's rows. The view holds a window of this many rows and slides it when you jump further.
 */
const WINDOW_ROWS = 400_000

const HEX = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'))

/** Colour bytes by kind, the way hex editors do, so structure shows at a glance. */
function byteClass(b: number): string {
  if (b === 0) return 'hb-zero'
  if (b >= 0x20 && b <= 0x7e) return 'hb-text'
  if (b === 0xff) return 'hb-ff'
  return 'hb-bin'
}

export function HexView({ bytes, sections, target }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const totalRows = Math.ceil(bytes.length / COLS)
  const [base, setBase] = useState(0) // first row of the current window
  const rows = Math.min(WINDOW_ROWS, totalRows - base)
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')

  const virtualizer = useVirtualizer({
    count: rows,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_PX,
    overscan: 20,
  })

  const goTo = (offset: number) => {
    const row = Math.floor(Math.min(Math.max(0, offset), bytes.length - 1) / COLS)
    let b = base
    if (row < base || row >= base + WINDOW_ROWS) {
      b = Math.max(0, row - WINDOW_ROWS / 2)
      setBase(b)
    }
    // Let a window change render before scrolling into it.
    requestAnimationFrame(() => virtualizer.scrollToIndex(row - b, { align: 'center' }))
  }

  useEffect(() => {
    if (target) goTo(target.start)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target])

  const items = virtualizer.getVirtualItems()
  // The section under the top of the view (skipping the overscan rows above it).
  const topRow = base + Math.floor((virtualizer.scrollOffset ?? 0) / ROW_PX)
  const here = sectionAt(sections, topRow * COLS)

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    const text = query.trim().toLowerCase()
    const n = text.startsWith('0x') ? parseInt(text.slice(2), 16) : /[a-f]/.test(text) ? parseInt(text, 16) : parseInt(text, 10)
    if (!Number.isFinite(n) || n < 0 || n >= bytes.length) {
      setError(`Enter an offset between 0 and ${hex(bytes.length - 1, 0)}`)
      return
    }
    setError('')
    goTo(n)
  }

  const fileSections = useMemo(() => sections.filter((s) => s.fileSize > 0), [sections])

  return (
    <div className="hex">
      <div className="hex-bar">
        <form onSubmit={onSubmit} className="hex-goto">
          <label htmlFor="hex-offset">Go to offset</label>
          <input
            id="hex-offset"
            className="search"
            placeholder="0x1a2b or 6699"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            spellCheck={false}
          />
        </form>
        {fileSections.length > 0 && (
          <select
            className="search hex-section"
            aria-label="Jump to section"
            value=""
            onChange={(e) => e.target.value && goTo(Number(e.target.value))}
          >
            <option value="">Jump to section…</option>
            {fileSections.map((s, i) => (
              <option key={i} value={s.fileOffset}>
                {s.name} at {hex(s.fileOffset, 0)}
              </option>
            ))}
          </select>
        )}
        <span className="hex-where mono">{here ? here.name : 'outside sections'}</span>
      </div>
      {error && <p className="hex-error">{error}</p>}

      <div className="hex-head mono" aria-hidden="true">
        <span className="hex-off">offset</span>
        <span className="hex-bytes">
          {Array.from({ length: COLS }, (_, i) => (
            <span key={i} className={i === 8 ? 'gap' : ''}>
              {HEX[i]}
            </span>
          ))}
        </span>
        <span className="hex-ascii">text</span>
      </div>

      <div ref={scrollRef} className="hex-scroll mono" tabIndex={0} aria-label="Hex dump of the file">
        <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
          {items.map((item) => {
            const row = base + item.index
            const start = row * COLS
            const slice = bytes.subarray(start, Math.min(start + COLS, bytes.length))
            const marked = target && start < target.end && start + COLS > target.start
            return (
              <div
                key={item.key}
                className={`hex-row ${marked ? 'is-marked' : ''}`}
                style={{ transform: `translateY(${item.start}px)`, height: ROW_PX }}
              >
                <span className="hex-off">{hex(start, 8)}</span>
                <span className="hex-bytes">
                  {Array.from(slice, (b, i) => (
                    <span key={i} className={`${byteClass(b)} ${i === 8 ? 'gap' : ''}`}>
                      {HEX[b]}
                    </span>
                  ))}
                </span>
                <span className="hex-ascii">
                  {Array.from(slice, (b) => (b >= 0x20 && b <= 0x7e ? String.fromCharCode(b) : '·')).join('')}
                </span>
              </div>
            )
          })}
        </div>
      </div>
      {totalRows > WINDOW_ROWS && (
        <p className="hex-note">
          Showing {hex(base * COLS, 0)} to {hex(Math.min((base + rows) * COLS, bytes.length) - 1, 0)}. Use Go to
          offset for the rest of the file.
        </p>
      )}
    </div>
  )
}
