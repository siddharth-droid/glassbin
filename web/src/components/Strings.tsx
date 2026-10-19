import { useMemo, useState } from 'react'
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
const MAX_ROWS = 400

export function Strings({ strings, total }: { strings: FoundString[]; total: number }) {
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<StringKind | 'all'>('all')

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

  return (
    <div className="strings">
      <div className="strings-controls">
        <input
          className="search"
          type="search"
          placeholder="Search strings…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search strings"
        />
        <div className="chips" role="tablist">
          {KINDS.map(({ kind: k, label }) => (
            <button
              key={k}
              role="tab"
              aria-selected={kind === k}
              className={`chip ${kind === k ? 'chip--on' : ''}`}
              onClick={() => setKind(k)}
              disabled={!counts[k]}
            >
              {label} <span className="count">{counts[k] ?? 0}</span>
            </button>
          ))}
        </div>
      </div>
      <ul className="string-list mono">
        {filtered.slice(0, MAX_ROWS).map((s) => (
          <li key={s.offset} className={`str str--${s.kind}`}>
            <span className="muted">{hex(s.offset)}</span>
            <span className="str-text">{s.text}</span>
          </li>
        ))}
      </ul>
      <p className="muted small">
        Showing {Math.min(filtered.length, MAX_ROWS)} of {filtered.length} matches
        {total > strings.length && ` · first ${strings.length} of ${total} strings in the file`}
      </p>
    </div>
  )
}
