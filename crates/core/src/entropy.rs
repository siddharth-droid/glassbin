//! Shannon entropy: how "random" a run of bytes looks, from 0.0 to 8.0 bits per byte.
//!
//! Rough guide:
//!   0.0       – all the same byte (padding, zeroed memory)
//!   ~4.5–5.5  – text, ordinary code
//!   ~6–7      – machine code, mixed data
//!   ~7.9+     – compressed or encrypted (packers, embedded zips, keys)

/// Entropy of a whole slice, in bits per byte.
pub fn shannon_entropy(bytes: &[u8]) -> f64 {
    if bytes.is_empty() {
        return 0.0;
    }

    // Count how often each of the 256 possible byte values appears.
    // A fixed-size array lives on the stack — no heap allocation.
    let mut counts = [0u64; 256];
    for &b in bytes {
        counts[b as usize] += 1;
    }

    let len = bytes.len() as f64;
    counts
        .iter()
        .filter(|&&c| c > 0)
        .map(|&c| {
            let p = c as f64 / len;
            -p * p.log2()
        })
        .sum()
}

/// Split the input into `block_size` chunks and return the entropy of each one.
/// This is what the entropy heatmap in the UI will draw — one cell per block.
pub fn block_entropy(bytes: &[u8], block_size: usize) -> Vec<f64> {
    assert!(block_size > 0, "block_size must be > 0");
    bytes.chunks(block_size).map(shannon_entropy).collect()
}

/// Like [`block_entropy`], one value per `step` bytes — but each value is measured over a
/// `window` of bytes centred on that step.
///
/// Why: a run of `n` bytes can hold at most `n` distinct values, so its entropy can never
/// exceed log2(n). A 64-byte block of perfectly random data maxes out at 6.0, and would be
/// drawn like ordinary code instead of the encrypted data it is. A wider window fixes the
/// measurement while keeping the fine `step` resolution for drawing.
pub fn windowed_entropy(bytes: &[u8], step: usize, window: usize) -> Vec<f64> {
    assert!(step > 0, "step must be > 0");
    if window <= step {
        return block_entropy(bytes, step);
    }
    let half = (window - step) / 2;
    (0..bytes.len().div_ceil(step))
        .map(|i| {
            // Centre the window on this step, then slide it back inside the file at the edges.
            let start = (i * step).saturating_sub(half).min(bytes.len().saturating_sub(window));
            let end = (start + window).min(bytes.len());
            shannon_entropy(&bytes[start..end])
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_is_zero() {
        assert_eq!(shannon_entropy(&[]), 0.0);
    }

    #[test]
    fn single_value_is_zero() {
        assert_eq!(shannon_entropy(&[0x41; 1000]), 0.0);
    }

    #[test]
    fn every_byte_once_is_eight() {
        let all: Vec<u8> = (0..=255).collect();
        assert!((shannon_entropy(&all) - 8.0).abs() < 1e-9);
    }

    #[test]
    fn two_values_evenly_is_one() {
        let data: Vec<u8> = (0..1000).map(|i| if i % 2 == 0 { 0 } else { 1 }).collect();
        assert!((shannon_entropy(&data) - 1.0).abs() < 1e-9);
    }

    /// Deterministic pseudo-random bytes (xorshift), so tests don't need a `rand` dependency.
    fn noise(len: usize) -> Vec<u8> {
        let mut x: u32 = 0x9E37_79B9;
        (0..len)
            .map(|_| {
                x ^= x << 13;
                x ^= x >> 17;
                x ^= x << 5;
                (x >> 24) as u8
            })
            .collect()
    }

    #[test]
    fn small_blocks_cannot_see_randomness() {
        // The bug windowed_entropy exists to fix: 64 bytes can't score above log2(64) = 6.
        let blocks = block_entropy(&noise(64 * 100), 64);
        assert!(blocks.iter().all(|&e| e <= 6.0 + 1e-9));
    }

    #[test]
    fn windows_reveal_randomness_at_fine_steps() {
        let values = windowed_entropy(&noise(64 * 100), 64, 4096);
        assert_eq!(values.len(), 100); // still one value per 64-byte step
        assert!(values.iter().all(|&e| e > 7.9), "random data should read close to 8");
    }

    #[test]
    fn window_never_exceeds_input() {
        let values = windowed_entropy(&noise(300), 64, 4096);
        assert_eq!(values.len(), 5);
    }

    #[test]
    fn blocks_cover_whole_input() {
        let data = vec![0u8; 2500];
        let blocks = block_entropy(&data, 1024);
        assert_eq!(blocks.len(), 3); // 1024 + 1024 + 452
    }
}
