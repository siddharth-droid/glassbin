import { useEffect, useRef, type RefObject } from 'react'
import type { Report } from '../types'
import { entropyRgb } from '../lib/format'
import { ScrollTrigger, prefersReducedMotion } from '../lib/motion'
import { observeWidth } from '../lib/observeWidth'

interface Props {
  bytes: Uint8Array
  report: Report
  /** Element whose scroll drives the hex → heatmap transition. */
  triggerRef: RefObject<HTMLElement | null>
}

const HEX = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'))

interface Cell {
  hex: string
  rgb: [number, number, number]
  /** 0–1, when this cell flips during the scroll sweep. */
  delay: number
}

/**
 * The whole file squeezed into a grid. Every cell shows the real byte at that position,
 * then — as you scroll — turns into the colour of that region's entropy. It's the product's
 * core idea (bytes → a map) told without a single word.
 */
export function ByteField({ bytes, report, triggerRef }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    const reduce = prefersReducedMotion()

    let cells: Cell[] = []
    let cols = 0
    let rows = 0
    let cell = 0
    let progress = reduce ? 1 : 0
    let pointer: { x: number; y: number } | null = null
    let raf = 0

    // Sized from the parent: the canvas itself snaps to whole cells, so observing it would loop.
    const layout = () => {
      const w = canvas.parentElement!.clientWidth
      cell = w < 560 ? 20 : 26
      cols = Math.floor(w / cell)
      rows = w < 560 ? 14 : 11
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
      raf = 0
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
        // How "revealed" this cell is: scroll sweep, plus a soft spotlight under the pointer.
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
      if (!raf) raf = requestAnimationFrame(draw)
    }

    const stopObserving = observeWidth(canvas.parentElement!, layout)
    // The canvas font comes from a webfont; redraw once it has loaded.
    document.fonts.ready.then(requestDraw)

    const st = reduce
      ? null
      : ScrollTrigger.create({
          trigger: triggerRef.current,
          start: 'top top',
          end: '+=75%',
          scrub: true,
          onUpdate: (self) => {
            progress = self.progress * 1.25
            requestDraw()
          },
        })

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
      canvas.addEventListener('pointermove', onMove)
      canvas.addEventListener('pointerleave', onLeave)
    }

    return () => {
      stopObserving()
      st?.kill()
      cancelAnimationFrame(raf)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerleave', onLeave)
    }
  }, [bytes, report, triggerRef])

  return (
    <canvas
      ref={canvasRef}
      className="bytefield"
      role="img"
      aria-label="The bytes of binscope.exe as hexadecimal, turning into a colour map of their entropy"
    />
  )
}
