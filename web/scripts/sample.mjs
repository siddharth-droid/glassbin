// Build the sample programs in release mode and copy them into public/samples/.
//
// Rust embeds source file paths in binaries (for panic messages), which would publish the
// builder's home directory. `--remap-path-prefix` rewrites them to neutral prefixes.
// A separate target dir keeps these flags from invalidating the normal release build.
import { execSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'

const root = resolve('..')
const targetDir = resolve(root, 'target', 'sample')
const env = {
  ...process.env,
  RUSTFLAGS: `--remap-path-prefix=${homedir()}=~ --remap-path-prefix=${root}=glassbin`,
  CARGO_TARGET_DIR: targetDir,
}

execSync('cargo build --release -p glassbin -p demo-app', { stdio: 'inherit', cwd: root, env })
mkdirSync('public/samples', { recursive: true })

// The landing page's two samples: glassbin's own CLI (an ordinary program) and demo-app
// (harmless, but built to trip the checks). The .exe names are what the page links to.
for (const [crate, published] of [
  ['glassbin', 'glassbin.exe'],
  ['demo-app', 'demo-app.exe'],
]) {
  const exe = [`${crate}.exe`, crate].map((f) => resolve(targetDir, 'release', f)).find(existsSync)
  if (!exe) throw new Error(`release binary for ${crate} not found`)
  copyFileSync(exe, `public/samples/${published}`)
  console.log(`copied ${exe} → public/samples/${published}`)
}
