import { useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { FoundString } from '../types'
import { classifyString, type StringKind } from '../lib/capabilities'
import { hex } from '../lib/format'

const KINDS: { kind: StringKind | 'all'; label: string }[] = [
  { kind: 'all', label: 'All' },
  { kind: 'url', label: 'URLs' },
  { kind: 'path', label: 'Paths' },
  { kind: 'library', label: 'Libraries' },
  { kind: 'text', label: 'Text' },
]

interface Props {
  strings: FoundString[]
  total: number
  /** Show this string's bytes in the hex view. */
  onShow: (s: FoundString) => void
}

export function Strings({ strings, total, onShow }: Props) {
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<StringKind | 'all'>('all')
  const scrollRef = useRef<HTMLDivElement>(null)

  const classified = useMemo(() => strings.map((s) => ({ ...s, kind: classifyString(s.text) })), [strings])
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: classified.length }
    for (const s of classified) c[s.kind] = (c[s.kind] ?? 0) + 1
    return c
  }, [classified])
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return classified.filter((s) => (kind === 'all' || s.kind === kind) && (!q || s.text.toLowerCase().includes(q)))
  }, [classified, kind, query])

  // Only the rows on screen are in the DOM; long strings wrap, so rows are measured.
  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 28,
    overscan: 12,
  })

  return (
    <div className="strings">
      <div className="strings-controls">
        <input
          className="search"
          type="search"
          placeholder={`Search ${strings.length.toLocaleString()} strings…`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search strings"
        />
        <div className="chips" role="group" aria-label="Filter by kind">
          {KINDS.map(({ kind: k, label }) => (
            <button
              key={k}
              aria-pressed={kind === k}
              className={`chip ${kind === k ? 'chip--on' : ''}`}
              onClick={() => setKind(k)}
              disabled={!counts[k]}
            >
              {label} <span className="count">{counts[k] ?? 0}</span>
            </button>
          ))}
        </div>
      </div>

      <div ref={scrollRef} className="string-scroll">
        {filtered.length === 0 && <p className="muted empty">No strings match.</p>}
        <ul className="string-list mono" style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((item) => {
            const s = filtered[item.index]
            return (
              <li
                key={s.offset}
                ref={virtualizer.measureElement}
                data-index={item.index}
                className={`str str--${s.kind}`}
                style={{ transform: `translateY(${item.start}px)` }}
              >
                <button onClick={() => onShow(s)} title="Show in hex">
                  <span className="str-off">{hex(s.offset)}</span>
                  <span className="str-text">{s.text}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>
      <p className="muted small">
        {filtered.length.toLocaleString()} shown. Click a string to see it in the hex view.
        {total > strings.length && ` The file has ${total.toLocaleString()} strings; the first ${strings.length.toLocaleString()} are listed.`}
      </p>
    </div>
  )
}
