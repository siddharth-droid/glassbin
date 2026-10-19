# glassbin

**See what a program is made of.** Drop in a Windows, Linux or macOS executable and glassbin maps its
sections, imports, strings and entropy — in your browser, with nothing uploaded.

**[Try it →](https://siddharth-droid.github.io/glassbin/)**

![The glassbin landing page: a program's bytes shown as hex, turning into an entropy heatmap](docs/landing.png)

## What it shows

- **Entropy map.** Every cell is a slice of the file, coloured by how random its bytes are. Code reads
  orange, padding reads dark, and compressed or encrypted data glows near-white — the first sign of a
  packed or obfuscated program.
- **Sections.** How the file is laid out (`.text`, `.rdata`, …), with each one's size and entropy.
  Hover a section to light it up on the map.
- **Capabilities.** What the program can do — network, process control, registry, anti-debugging —
  inferred from the system functions it imports, without running it.
- **Imports and strings.** Searchable, with URLs, file paths and library names picked out.

![A report for a test program: an entropy map with a bright band of random data, and its sections](docs/workspace.png)

## How it works

All analysis lives in one Rust library, **`glassbin-core`**. Everything else is a thin shell around it:

```
crates/core   parsing (PE, ELF, Mach-O via goblin), entropy, string extraction — no I/O
crates/wasm   wasm-bindgen wrapper; the web app runs it in a Web Worker
crates/cli    the `glassbin` command-line tool
web/          React + WebGL front end (Vite)
```

The browser build copies the file into the WebAssembly module's memory and nowhere else. The landing
page shows its own network requests, read live from the browser, so you can check that claim.

### Built to take hostile input

Malware is often deliberately malformed to crash the tools that inspect it. glassbin is written in
memory-safe Rust, and:

- `crates/core/tests/hostile_input.rs` corrupts a real executable thousands of ways (header damage,
  random damage, truncation) and requires the pipeline to survive every one.
- `fuzz/` holds a [cargo-fuzz](https://github.com/rust-fuzz/cargo-fuzz) target for coverage-guided
  fuzzing, which CI runs weekly.
- In the browser, analysis runs in a Web Worker with a size limit and a timeout. If the engine ever
  fails, the worker is discarded and a fresh one takes its place.

## Run it locally

You need [Rust](https://rustup.rs), [wasm-pack](https://rustwasm.github.io/wasm-pack/) and Node 20+.

```sh
# the CLI
cargo run --release -p glassbin -- path/to/program.exe

# the web app
cd web
npm install
npm run wasm     # compile the Rust engine to WebAssembly
npm run sample   # build the sample binary the landing page analyzes
npm run dev
```

Tests: `cargo test` (Rust) and `npm run build` (types and bundle). Fuzzing: `cargo +nightly fuzz run parse`
from the repository root, on Linux or macOS.

## Limitations

- Universal (fat) Mach-O files aren't parsed yet; entropy and strings still work on them.
- String extraction is ASCII-only, and its noise filter is a heuristic.
- Files up to 256 MB in the browser.

## Licence

MIT — see [LICENSE](LICENSE).
