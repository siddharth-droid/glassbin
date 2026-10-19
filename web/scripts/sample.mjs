// Build the binscope CLI in release mode and copy it into public/ as the "try it on itself" sample.
import { execSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'

execSync('cargo build --release -p binscope', { stdio: 'inherit', cwd: '..' })
const exe = ['../target/release/binscope.exe', '../target/release/binscope'].find(existsSync)
if (!exe) throw new Error('release binary not found')
mkdirSync('public/samples', { recursive: true })
copyFileSync(exe, 'public/samples/binscope-cli.exe')
console.log(`copied ${exe} → public/samples/binscope-cli.exe`)
