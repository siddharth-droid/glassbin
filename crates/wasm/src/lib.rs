//! The browser entry point. `wasm-bindgen` generates the JavaScript glue so the web app can
//! call `analyze(bytes)` like a normal JS function — the file never leaves the user's machine.

use glassbin_core::{
    BinaryInfo, FoundString, drop_repeated, extract_strings, is_meaningful, parse, shannon_entropy,
    windowed_entropy,
};
use serde::Serialize;
use wasm_bindgen::prelude::*;

/// Aim for about this many cells in the entropy heatmap, whatever the file size.
const TARGET_BLOCKS: usize = 4096;
/// Measure each cell over at least this many bytes. Fewer bytes cap entropy at log2(n),
/// so random data in small cells would look like plain code (see `windowed_entropy`).
const MIN_WINDOW: usize = 2048;
const MIN_STRING_LEN: usize = 6;
/// A string seen more often than this is a code pattern, not text.
const MAX_REPEATS: usize = 3;
/// Cap what we send to JS — a big binary can hold hundreds of thousands of strings.
const MAX_STRINGS: usize = 5000;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Report {
    size: usize,
    entropy: f64,
    block_size: usize,
    blocks: Vec<f32>,
    /// `None` when the file isn't an executable we can parse — the rest still works.
    binary: Option<BinaryInfo>,
    parse_error: Option<String>,
    string_count: usize,
    strings: Vec<FoundString>,
}

/// Power-of-two block size that gives roughly `TARGET_BLOCKS` blocks (minimum 64 bytes).
fn pick_block_size(len: usize) -> usize {
    len.div_ceil(TARGET_BLOCKS).next_power_of_two().max(64)
}

/// Runs once when the module loads. A Rust panic in WASM otherwise surfaces in JS as a bare
/// "unreachable executed"; this hook logs the real message and location to the console first.
#[wasm_bindgen(start)]
fn start() {
    std::panic::set_hook(Box::new(console_error_panic_hook::hook));
}

#[wasm_bindgen]
pub fn analyze(bytes: &[u8]) -> Result<JsValue, JsError> {
    let block_size = pick_block_size(bytes.len());

    let (binary, parse_error) = match parse(bytes) {
        Ok(info) => (Some(info), None),
        Err(e) => (None, Some(e.to_string())),
    };

    let strings: Vec<FoundString> = extract_strings(bytes, MIN_STRING_LEN)
        .into_iter()
        .filter(|s| is_meaningful(&s.text))
        .collect();
    let mut strings = drop_repeated(strings, MAX_REPEATS);
    let string_count = strings.len();
    strings.truncate(MAX_STRINGS);

    let report = Report {
        size: bytes.len(),
        entropy: shannon_entropy(bytes),
        block_size,
        // f32 is plenty of precision for drawing, and halves the data crossing into JS.
        blocks: windowed_entropy(bytes, block_size, block_size.max(MIN_WINDOW))
            .into_iter()
            .map(|e| e as f32)
            .collect(),
        binary,
        parse_error,
        string_count,
        strings,
    };

    // Converts the Rust struct into a plain JS object. `?` turns a serde error into a JS exception.
    Ok(serde_wasm_bindgen::to_value(&report)?)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn block_size_scales_with_file() {
        assert_eq!(pick_block_size(0), 64);
        assert_eq!(pick_block_size(10_000), 64);
        assert_eq!(pick_block_size(360_448), 128); // notepad.exe → ~2.8k blocks
        assert_eq!(pick_block_size(50_000_000), 16_384);
    }
}
