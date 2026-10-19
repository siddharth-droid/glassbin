/** The mark: four heatmap cells, padding → code → data → compressed. Same squares as the favicon. */
export function Glyph({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" className="glyph">
      <rect width="7" height="7" rx="1.5" fill="#932667" />
      <rect x="9" width="7" height="7" rx="1.5" fill="#e8602b" />
      <rect y="9" width="7" height="7" rx="1.5" fill="#fa9407" />
      <rect x="9" y="9" width="7" height="7" rx="1.5" fill="#fcffa4" />
    </svg>
  )
}
