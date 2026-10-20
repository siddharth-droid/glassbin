//! Writes 64 KB of pseudo-random bytes for main.rs to embed. Generated rather than committed,
//! and seeded, so every build of the sample is byte-for-byte the same.

fn main() {
    let mut x: u64 = 0x9E37_79B9_7F4A_7C15;
    let bytes: Vec<u8> = (0..64 * 1024)
        .map(|_| {
            // xorshift64*: plenty random for an entropy demo, no dependency needed.
            x ^= x >> 12;
            x ^= x << 25;
            x ^= x >> 27;
            (x.wrapping_mul(0x2545_F491_4F6C_DD1D) >> 56) as u8
        })
        .collect();
    let out = std::path::PathBuf::from(std::env::var("OUT_DIR").unwrap()).join("random.bin");
    std::fs::write(out, bytes).unwrap();
}
