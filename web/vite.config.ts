import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Content-Security-Policy for production builds. The page analyzes untrusted files, so it may
 * only run its own code and talk to its own origin: nothing can phone home with a file's
 * contents even if something went wrong. GitHub Pages can't send headers, hence a meta tag.
 * Build-only, because Vite's dev server relies on inline scripts and a websocket.
 */
function contentSecurityPolicy(): Plugin {
  const policy = [
    "default-src 'self'",
    "script-src 'self' 'wasm-unsafe-eval'", // compiling the WASM engine
    "worker-src 'self'",
    "style-src 'self' 'unsafe-inline'", // React style attributes (colours, sizes)
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ')
  return {
    name: 'content-security-policy',
    apply: 'build',
    transformIndexHtml: (html) =>
      html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`),
  }
}

export default defineConfig({
  // GitHub Pages serves the site from /<repo>/, so CI sets BASE_PATH=/glassbin/.
  base: process.env.BASE_PATH ?? '/',
  plugins: [react(), contentSecurityPolicy()],
  // The analysis worker imports the wasm-bindgen glue, which is an ES module.
  worker: { format: 'es' },
})
