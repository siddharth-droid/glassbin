//! Coverage-guided fuzzing of the parser: libFuzzer mutates inputs to reach new code paths
//! and reports any input that panics, hangs or runs out of memory.
//!
//!     cargo +nightly fuzz run parse          (Linux or macOS)
#![no_main]

use libfuzzer_sys::fuzz_target;

fuzz_target!(|data: &[u8]| {
    let _ = glassbin_core::parse(data);
    let _ = glassbin_core::extract_strings(data, 6);
});
