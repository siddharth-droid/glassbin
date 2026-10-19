// Build the glassbin CLI in release mode and copy it into public/ as the "try it on itself" sample.
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

execSync('cargo build --release -p glassbin', { stdio: 'inherit', cwd: root, env })
const exe = ['glassbin.exe', 'glassbin'].map((f) => resolve(targetDir, 'release', f)).find(existsSync)
if (!exe) throw new Error('release binary not found')
mkdirSync('public/samples', { recursive: true })
copyFileSync(exe, 'public/samples/glassbin-cli.exe')
console.log(`copied ${exe} → public/samples/glassbin-cli.exe`)
