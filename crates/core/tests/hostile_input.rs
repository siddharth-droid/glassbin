//! Malware is often deliberately malformed to crash the tools that inspect it, so the engine
//! must survive *any* input. These tests take a real executable, damage it thousands of ways,
//! and run the whole pipeline on every variant. The test passes if nothing panics.
//!
//! This is a cheap, stable-Rust cousin of coverage-guided fuzzing (see `fuzz/` for that).

use glassbin_core::{
    drop_repeated, extract_strings, is_meaningful, parse, shannon_entropy, windowed_entropy,
};

/// Small deterministic PRNG, so a failure can be reproduced from its iteration number.
struct Rng(u64);
impl Rng {
    fn next(&mut self) -> u64 {
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 7;
        self.0 ^= self.0 << 17;
        self.0
    }
    fn below(&mut self, n: usize) -> usize {
        (self.next() % n as u64) as usize
    }
}

/// Everything the browser does with a file. The parser is the part that trusts header fields,
/// so the tests run it on every mutation; the byte scans (entropy, strings) can't be steered
/// by headers, so they run on a sample of mutations to keep the suite fast.
fn run_pipeline(bytes: &[u8]) {
    let _ = parse(bytes);
}

fn run_everything(bytes: &[u8]) {
    let _ = parse(bytes);
    let _ = shannon_entropy(bytes);
    let _ = windowed_entropy(bytes, 64, 2048);
    let strings = extract_strings(bytes, 6)
        .into_iter()
        .filter(|s| is_meaningful(&s.text))
        .collect();
    let _ = drop_repeated(strings, 3);
}

fn real_executable() -> Vec<u8> {
    // The test runner itself: PE on Windows, ELF on Linux, Mach-O on macOS.
    std::fs::read(std::env::current_exe().unwrap()).unwrap()
}

#[test]
fn survives_corrupted_headers() {
    let original = real_executable();
    let mut rng = Rng(0x5EED_1234_ABCD_0001);
    // Headers live in the first few KB; damage there reaches the parser's deepest assumptions.
    let header_len = original.len().min(4096);
    for i in 0..3000 {
        let mut bytes = original.clone();
        for _ in 0..1 + rng.below(8) {
            let at = rng.below(header_len);
            bytes[at] = rng.next() as u8;
        }
        let full = i % 100 == 0;
        let result = std::panic::catch_unwind(|| {
            if full {
                run_everything(&bytes)
            } else {
                run_pipeline(&bytes)
            }
        });
        assert!(result.is_ok(), "panicked on header mutation #{i}");
    }
}

#[test]
fn survives_damage_anywhere() {
    let original = real_executable();
    let mut rng = Rng(0x5EED_1234_ABCD_0002);
    for i in 0..300 {
        let mut bytes = original.clone();
        for _ in 0..1 + rng.below(64) {
            let at = rng.below(bytes.len());
            bytes[at] = rng.next() as u8;
        }
        let full = i % 30 == 0;
        let result = std::panic::catch_unwind(|| {
            if full {
                run_everything(&bytes)
            } else {
                run_pipeline(&bytes)
            }
        });
        assert!(result.is_ok(), "panicked on random mutation #{i}");
    }
}

#[test]
fn survives_truncation() {
    let original = real_executable();
    // Cut the file at many lengths, densest near the start where the headers are.
    let mut cuts: Vec<usize> = (0..2048).step_by(7).collect();
    cuts.extend((2048..original.len()).step_by(original.len() / 200 + 1));
    for len in cuts {
        let result = std::panic::catch_unwind(|| run_pipeline(&original[..len]));
        assert!(result.is_ok(), "panicked on file truncated to {len} bytes");
    }
}

#[test]
fn survives_tiny_and_degenerate_files() {
    for bytes in [
        &b""[..],
        b"MZ",
        b"\x7fELF",
        b"\xcf\xfa\xed\xfe",
        &[0u8; 64],
        &[0xFFu8; 4096],
    ] {
        run_everything(bytes);
    }
}
