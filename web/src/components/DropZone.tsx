import { useRef, useState, type DragEvent } from 'react'

interface Props {
  compact: boolean
  busy: boolean
  onFile: (file: File) => void
  onSample: () => void
}

export function DropZone({ compact, busy, onFile, onSample }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setOver(false)
    const file = e.dataTransfer.files[0]
    if (file) onFile(file)
  }

  return (
    <div
      className={`dropzone ${compact ? 'dropzone--compact' : ''} ${over ? 'dropzone--over' : ''}`}
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
    >
      <input
        ref={inputRef}
        type="file"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onFile(file)
          e.target.value = '' // allow re-selecting the same file
        }}
      />
      <div className="dropzone-text">
        <strong>{busy ? 'Analyzing…' : compact ? 'Drop another file' : 'Drop an executable here'}</strong>
        {!compact && <span className="muted">.exe · .dll · ELF · Mach-O · or any file at all</span>}
      </div>
      <div className="dropzone-actions">
        <button className="btn btn--primary" onClick={() => inputRef.current?.click()} disabled={busy}>
          Choose file
        </button>
        <button className="btn" onClick={onSample} disabled={busy}>
          Try binscope on itself
        </button>
      </div>
    </div>
  )
}
