import { useEffect, useRef } from 'react'
import type { Report } from '../types'
import { entropyRgb } from '../lib/format'
import { prefersReducedMotion } from '../lib/motion'
import { observeWidth } from '../lib/observeWidth'

interface Props {
  bytes: Uint8Array
  report: Report
  /** Turn the hex into the entropy map, e.g. while a file is dragged over the page. */
  revealed: boolean
}

const HEX = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'))

interface Cell {
  hex: string
  rgb: [number, number, number]
  /** 0 to 1, when this cell flips during the sweep. */
  delay: number
}

/**
 * The whole file squeezed into a grid behind the drop zone. Every cell shows the real byte at
 * that position; point at it (or drag a file in) and the bytes turn into the colour of their
 * entropy: the product's core idea, bytes into a map, told without words.
 */
export function ByteField({ bytes, report, revealed }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const targetRef = useRef(0)
  const kickRef = useRef<() => void>(() => {})

  useEffect(() => {
    targetRef.current = revealed ? 1.25 : 0
    kickRef.current()
  }, [revealed])

  useEffect(() => {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    const reduce = prefersReducedMotion()

    let cells: Cell[] = []
    let cols = 0
    let rows = 0
    let cell = 0
    let progress = 0
    let pointer: { x: number; y: number } | null = null
    let raf = 0

    // Sized from the parent: the canvas itself snaps to whole cells, so observing it would loop.
    const layout = () => {
      const host = canvas.parentElement!
      const w = host.clientWidth
      cell = w < 560 ? 20 : 26
      cols = Math.floor(w / cell)
      rows = Math.max(6, Math.floor(host.clientHeight / cell))
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(cols * cell * dpr)
      canvas.height = Math.round(rows * cell * dpr)
      canvas.style.width = `${cols * cell}px`
      canvas.style.height = `${rows * cell}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      // Each cell covers an equal slice of the file. Its colour is the mean entropy of the
      // heatmap blocks inside that slice; its label is the actual first byte of the slice.
      const n = cols * rows
      const { blocks, blockSize, size } = report
      cells = Array.from({ length: n }, (_, i) => {
        const start = Math.floor((i * size) / n)
        const end = Math.max(start + 1, Math.floor(((i + 1) * size) / n))
        const b0 = Math.floor(start / blockSize)
        const b1 = Math.max(b0 + 1, Math.ceil(end / blockSize))
        let sum = 0
        for (let b = b0; b < b1; b++) sum += blocks[b] ?? 0
        const col = i % cols
        const row = Math.floor(i / cols)
        // Sweep left→right with a little per-row jitter, so it reads as scanning, not wiping.
        const jitter = ((row * 7919) % 13) / 13
        return {
          hex: HEX[bytes[start]],
          rgb: entropyRgb(sum / (b1 - b0)),
          delay: (col / cols) * 0.75 + jitter * 0.25,
        }
      })
      draw()
    }

    const draw = () => {
      ctx.clearRect(0, 0, cols * cell, rows * cell)
      ctx.font = `${cell < 24 ? 9 : 11}px 'Martian Mono Variable', ui-monospace, monospace`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      const gap = 2
      const radius = cell * 3.2

      for (let i = 0; i < cells.length; i++) {
        const c = cells[i]
        const x = (i % cols) * cell
        const y = Math.floor(i / cols) * cell
        // How "revealed" this cell is: the sweep, plus a soft spotlight under the pointer.
        let t = Math.min(1, Math.max(0, (progress - c.delay * 0.8) / 0.2))
        if (pointer) {
          const d = Math.hypot(x + cell / 2 - pointer.x, y + cell / 2 - pointer.y)
          t = Math.max(t, 1 - d / radius)
        }
        const [r, g, b] = c.rgb
        if (t > 0) {
          ctx.fillStyle = `rgba(${r},${g},${b},${t})`
          ctx.fillRect(x + gap / 2, y + gap / 2, cell - gap, cell - gap)
        }
        if (t < 1) {
          // Hex text is tinted by its own entropy, so structure shows even before the reveal.
          ctx.fillStyle = `rgba(${(r + 236) / 2 | 0},${(g + 228) / 2 | 0},${(b + 216) / 2 | 0},${0.55 * (1 - t)})`
          ctx.fillText(c.hex, x + cell / 2, y + cell / 2 + 0.5)
        }
      }
    }
    const requestDraw = () => {
      if (!raf) raf = requestAnimationFrame(step)
    }
    // Ease the sweep toward its target each frame; stop drawing once it arrives.
    const step = () => {
      raf = 0
      const target = targetRef.current
      progress = reduce ? target : progress + (target - progress) * 0.12
      if (Math.abs(target - progress) < 0.002) progress = target
      draw()
      if (progress !== target) requestDraw()
    }
    kickRef.current = requestDraw

    const stopObserving = observeWidth(canvas.parentElement!, layout)
    // The canvas font comes from a webfont; redraw once it has loaded.
    document.fonts.ready.then(requestDraw)

    // Listen on the host: the drop zone's text and buttons sit on top of the canvas.
    const host = canvas.parentElement!
    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect()
      pointer = { x: e.clientX - r.left, y: e.clientY - r.top }
      requestDraw()
    }
    const onLeave = () => {
      pointer = null
      requestDraw()
    }
    if (!reduce) {
      host.addEventListener('pointermove', onMove)
      host.addEventListener('pointerleave', onLeave)
    }

    return () => {
      stopObserving()
      cancelAnimationFrame(raf)
      host.removeEventListener('pointermove', onMove)
      host.removeEventListener('pointerleave', onLeave)
    }
  }, [bytes, report])

  return (
    <canvas
      ref={canvasRef}
      className="bytefield"
      aria-hidden="true"
    />
  )
}
