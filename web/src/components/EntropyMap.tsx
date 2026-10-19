import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import type { ByteRange, Section } from '../types'
import { entropyColor, entropyLabel, hex, sectionAt } from '../lib/format'

interface Props {
  blocks: number[]
  blockSize: number
  sections: Section[]
  highlight: ByteRange | null
  /** Smallest cell width in CSS px; lower packs more columns, for a compact overview. */
  minCellPx?: number
}

// One full-screen triangle pair; the fragment shader does all the work per pixel.
const VERT = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = vec2(a_pos.x * 0.5 + 0.5, 0.5 - a_pos.y * 0.5);
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`

const FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;

uniform sampler2D u_data;   // one texel per block, entropy / 8 in the red channel
uniform vec2  u_grid;       // columns, rows
uniform float u_count;      // number of real blocks (last row may be partial)
uniform float u_cellPx;     // cell size in device pixels, for crisp 1px gaps
uniform float u_time;
uniform float u_reveal;     // 0 → 1 intro sweep
uniform float u_hover;      // hovered block index, -1 for none
uniform vec2  u_range;      // highlighted block range [start, end), or (0,0)

vec3 inferno(float t) {
  const vec3 c0 = vec3(0.0002189403691192265, 0.001651004631001012, -0.01948089843709184);
  const vec3 c1 = vec3(0.1065134194856116, 0.5639564367884091, 3.932712388889277);
  const vec3 c2 = vec3(11.60249308247187, -3.972853965665698, -15.9423941062914);
  const vec3 c3 = vec3(-41.70399613139459, 17.43639888205313, 44.35414519872813);
  const vec3 c4 = vec3(77.162935699427, -33.40235894210092, -81.80730925738993);
  const vec3 c5 = vec3(-71.31942824499214, 32.62606426397723, 73.20951985803202);
  const vec3 c6 = vec3(25.13112622477341, -12.24266895238567, -23.07032500287172);
  return c0 + t * (c1 + t * (c2 + t * (c3 + t * (c4 + t * (c5 + t * c6)))));
}

void main() {
  vec2 cellF = v_uv * u_grid;
  vec2 cell = floor(cellF);
  vec2 local = fract(cellF);
  float idx = cell.y * u_grid.x + cell.x;
  if (idx >= u_count) { outColor = vec4(0.0); return; }

  float e = texelFetch(u_data, ivec2(cell), 0).r;
  vec3 col = inferno(0.06 + e * 0.9);

  // Compressed / encrypted blocks shimmer, so they catch the eye.
  float hot = smoothstep(0.93, 0.99, e);
  col += hot * 0.10 * (0.5 + 0.5 * sin(u_time * 2.5 + idx * 0.45));

  bool hasRange = u_range.y > u_range.x;
  if (hasRange && (idx < u_range.x || idx >= u_range.y)) col *= 0.22;
  if (idx == u_hover) col = mix(col, vec3(1.0), 0.55);

  // Intro: cells fade in, sweeping from the start of the file to the end.
  float appear = clamp((u_reveal * 1.4 - idx / u_count) / 0.4, 0.0, 1.0);

  // A 1px gap between cells.
  float g = 1.0 / u_cellPx;
  float inside = step(g, local.x) * step(g, local.y);

  float a = appear * inside;
  outColor = vec4(col * a, a); // premultiplied alpha
}`

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const sh = gl.createShader(type)!
  gl.shaderSource(sh, src)
  gl.compileShader(sh)
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) ?? 'shader error')
  return sh
}

/** Wider grids for bigger files, so cells stay a readable size. */
const columnsFor = (n: number) => (n <= 256 ? 32 : n <= 1024 ? 64 : 128)

export function EntropyMap({ blocks, blockSize, sections, highlight, minCellPx = 7 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [maxCols, setMaxCols] = useState(128)
  const hoverRef = useRef(-1)
  const rangeRef = useRef<[number, number]>([0, 0])
  const [tip, setTip] = useState<{ x: number; y: number; idx: number } | null>(null)

  // Narrow screens get fewer, taller rows instead of microscopic cells.
  useEffect(() => {
    const wrap = wrapRef.current!
    const ro = new ResizeObserver(([entry]) =>
      setMaxCols(Math.max(16, Math.floor(entry.contentRect.width / minCellPx))),
    )
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [minCellPx])

  const cols = Math.min(columnsFor(blocks.length), maxCols)
  const rows = Math.max(1, Math.ceil(blocks.length / cols))

  // Convert the highlighted byte range into block indices for the shader.
  useEffect(() => {
    rangeRef.current = highlight
      ? [Math.floor(highlight.start / blockSize), Math.ceil(highlight.end / blockSize)]
      : [0, 0]
  }, [highlight, blockSize])

  // Upload texture + run the render loop. Re-runs only when the file changes.
  useEffect(() => {
    const canvas = canvasRef.current!
    const gl = canvas.getContext('webgl2', { antialias: false })
    if (!gl) return

    const prog = gl.createProgram()!
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT))
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG))
    gl.linkProgram(prog)
    gl.useProgram(prog)

    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW)
    const loc = gl.getAttribLocation(prog, 'a_pos')
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)

    // Entropy 0–8 → byte 0–255, one texel per block.
    const data = new Uint8Array(cols * rows)
    blocks.forEach((e, i) => (data[i] = Math.round((e / 8) * 255)))
    const tex = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, cols, rows, 0, gl.RED, gl.UNSIGNED_BYTE, data)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)

    const u = (name: string) => gl.getUniformLocation(prog, name)
    const uGrid = u('u_grid'), uCount = u('u_count'), uCell = u('u_cellPx'), uTime = u('u_time')
    const uReveal = u('u_reveal'), uHover = u('u_hover'), uRange = u('u_range')

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = canvas.clientWidth
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(((w * rows) / cols) * dpr)
      gl.viewport(0, 0, canvas.width, canvas.height)
    }
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    resize()

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const start = performance.now()
    let raf = 0
    const frame = (now: number) => {
      const t = (now - start) / 1000
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.uniform2f(uGrid, cols, rows)
      gl.uniform1f(uCount, blocks.length)
      gl.uniform1f(uCell, canvas.width / cols)
      gl.uniform1f(uTime, reduceMotion ? 0 : t)
      gl.uniform1f(uReveal, reduceMotion ? 1 : Math.min(1, t / 1.1))
      gl.uniform1f(uHover, hoverRef.current)
      gl.uniform2f(uRange, rangeRef.current[0], rangeRef.current[1])
      gl.drawArrays(gl.TRIANGLES, 0, 6)
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      gl.deleteTexture(tex)
      gl.deleteBuffer(buf)
      gl.deleteProgram(prog)
    }
  }, [blocks, cols, rows])

  const onMove = (e: PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - r.left
    const y = e.clientY - r.top
    const col = Math.floor((x / r.width) * cols)
    const row = Math.floor((y / r.height) * rows)
    const idx = row * cols + col
    if (idx < 0 || idx >= blocks.length || col >= cols) return onLeave()
    hoverRef.current = idx
    setTip({ x, y, idx })
  }
  const onLeave = () => {
    hoverRef.current = -1
    setTip(null)
  }

  const tipInfo = useMemo(() => {
    if (!tip) return null
    const offset = tip.idx * blockSize
    return { offset, entropy: blocks[tip.idx], section: sectionAt(sections, offset)?.name }
  }, [tip, blockSize, blocks, sections])

  return (
    <div className="entropy-map">
      <div className="entropy-canvas-wrap" ref={wrapRef}>
        <canvas
          ref={canvasRef}
          className="entropy-canvas"
          style={{ aspectRatio: `${cols} / ${rows}` }}
          onPointerMove={onMove}
          onPointerLeave={onLeave}
          role="img"
          aria-label={`Entropy heatmap of ${blocks.length} blocks of ${blockSize} bytes`}
        />
        {tip && tipInfo && (
          <div
            className={`tooltip ${tip.x > 260 ? 'tooltip--left' : ''}`}
            style={{ left: tip.x, top: tip.y }}
          >
            <div className="tooltip-row">
              <span className="swatch" style={{ background: entropyColor(tipInfo.entropy) }} />
              <b>{tipInfo.entropy.toFixed(2)}</b> bits/byte
            </div>
            <div className="muted">{entropyLabel(tipInfo.entropy)}</div>
            <div className="mono">{hex(tipInfo.offset)}</div>
            {tipInfo.section && <div className="mono accent">{tipInfo.section}</div>}
          </div>
        )}
      </div>
      <div className="legend">
        <span>0</span>
        <div className="legend-bar" />
        <span>8 bits/byte</span>
      </div>
      <div className="legend-labels">
        <span>padding</span>
        <span>text</span>
        <span>code</span>
        <span>compressed / encrypted</span>
      </div>
    </div>
  )
}
