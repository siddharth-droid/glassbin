/**
 * Call `onWidth` when `el` changes width, and only width. Our canvases resize their own
 * height in response, which would otherwise re-trigger the observer ("ResizeObserver loop
 * completed with undelivered notifications"). The work is deferred to the next frame so it
 * never runs inside the observer callback. Returns a cleanup function.
 */
export function observeWidth(el: Element, onWidth: (width: number) => void): () => void {
  let last = -1
  let raf = 0
  const ro = new ResizeObserver(([entry]) => {
    const width = Math.round(entry.contentRect.width)
    if (width === last) return
    last = width
    cancelAnimationFrame(raf)
    raf = requestAnimationFrame(() => onWidth(width))
  })
  ro.observe(el)
  return () => {
    cancelAnimationFrame(raf)
    ro.disconnect()
  }
}
