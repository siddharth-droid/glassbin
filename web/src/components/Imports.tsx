import { useMemo, useState } from 'react'
import type { BinaryInfo } from '../types'
import { detectCapabilities } from '../lib/capabilities'

export function Capabilities({ binary }: { binary: BinaryInfo }) {
  const caps = useMemo(() => detectCapabilities(binary.imports), [binary])

  if (caps.length === 0) {
    return <p className="muted">No recognisable system capabilities in the import table.</p>
  }
  return (
    <ul className="caps">
      {caps.map((c) => (
        <li key={c.tag} className={`cap ${c.notable ? 'cap--notable' : ''}`}>
          <div className="cap-head">
            <span className="cap-tag">{c.tag}</span>
            <span className="cap-count">{c.functions.length}</span>
          </div>
          <div className="cap-fns mono">
            {c.functions.slice(0, 4).join(' · ')}
            {c.functions.length > 4 && ` · +${c.functions.length - 4}`}
          </div>
        </li>
      ))}
    </ul>
  )
}

export function Imports({ binary }: { binary: BinaryInfo }) {
  const [query, setQuery] = useState('')

  // Group by library; `Map` keeps insertion order, then we sort by size.
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    const map = new Map<string, string[]>()
    for (const imp of binary.imports) {
      const lib = imp.library ?? 'dynamic symbols'
      if (q && !imp.name.toLowerCase().includes(q) && !lib.toLowerCase().includes(q)) continue
      map.set(lib, [...(map.get(lib) ?? []), imp.name])
    }
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length)
  }, [binary, query])

  return (
    <div className="imports">
      <input
        className="search"
        type="search"
        placeholder={`Search ${binary.imports.length} imports…`}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Search imports"
      />
      <div className="import-groups">
        {groups.length === 0 && <p className="muted">No matches.</p>}
        {groups.map(([lib, names]) => (
          <details key={lib} open={query.length > 0 || groups.length <= 3}>
            <summary>
              <span className="mono">{lib}</span>
              <span className="count">{names.length}</span>
            </summary>
            <ul className="fn-list mono">
              {names.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          </details>
        ))}
      </div>
      {binary.exports.length > 0 && (
        <details className="exports">
          <summary>
            <span>Exports</span>
            <span className="count">{binary.exports.length}</span>
          </summary>
          <ul className="fn-list mono">
            {binary.exports.slice(0, 500).map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}
