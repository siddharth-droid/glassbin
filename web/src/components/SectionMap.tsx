import type { Section } from '../types'
import { entropyColor, entropyLabel, formatBytes, hex } from '../lib/format'

interface Props {
  sections: Section[]
  fileSize: number
  active: number | null
  pinned: number | null
  onHover: (index: number | null) => void
  onPin: (index: number | null) => void
  /** Just the bar, labelled underneath — no table. Used in the landing-page tour. */
  compact?: boolean
}

/** The file laid out left-to-right, one coloured segment per section, plus a detail table. */
export function SectionMap({ sections, fileSize, active, pinned, onHover, onPin, compact }: Props) {
  const toggle = (i: number) => onPin(pinned === i ? null : i)

  return (
    <div className="section-map">
      <div className="section-bar" onPointerLeave={() => onHover(null)}>
        {sections.map((s, i) =>
          s.fileSize === 0 ? null : (
            <button
              key={i}
              className={`seg ${active === i ? 'seg--active' : ''}`}
              style={{
                left: `${(s.fileOffset / fileSize) * 100}%`,
                width: `max(3px, ${(s.fileSize / fileSize) * 100}%)`,
                background: entropyColor(s.entropy),
              }}
              onPointerEnter={() => onHover(i)}
              onFocus={() => onHover(i)}
              onBlur={() => onHover(null)}
              onClick={() => toggle(i)}
              aria-pressed={pinned === i}
              aria-label={`${s.name}, ${formatBytes(s.fileSize)}, entropy ${s.entropy.toFixed(2)}`}
            >
              {s.fileSize / fileSize > 0.07 && <span className="seg-label">{s.name}</span>}
            </button>
          ),
        )}
      </div>

      {compact ? (
        active !== null && (
          <p className="section-caption">
            <span className="mono">{sections[active].name}</span>, {formatBytes(sections[active].fileSize)} at{' '}
            {sections[active].entropy.toFixed(2)} bits per byte: {entropyLabel(sections[active].entropy)}
          </p>
        )
      ) : (
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Section</th>
              <th className="num">Offset</th>
              <th className="num">Size</th>
              <th className="num">Entropy</th>
              <th>Reads as</th>
            </tr>
          </thead>
          <tbody onPointerLeave={() => onHover(null)}>
            {sections.map((s, i) => (
              <tr
                key={i}
                className={`${active === i ? 'row--active' : ''} ${pinned === i ? 'row--pinned' : ''}`}
                onPointerEnter={() => onHover(i)}
                onClick={() => toggle(i)}
              >
                <td className="mono">
                  <span className="swatch" style={{ background: entropyColor(s.entropy) }} />
                  {s.name}
                </td>
                <td className="mono num muted">{hex(s.fileOffset, 6)}</td>
                <td className="mono num">{formatBytes(s.fileSize)}</td>
                <td className="mono num">{s.fileSize ? s.entropy.toFixed(2) : '—'}</td>
                <td className="muted">{entropyLabel(s.entropy, s.fileSize)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
    </div>
  )
}
