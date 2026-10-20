//! A harmless test program for glassbin. It's built so each part of the analysis has
//! something to find: a random blob (high entropy), a zeroed buffer (padding), network
//! imports, and readable strings. Running it just prints a message.

use std::io::{Read, Write};
use std::net::TcpStream;

/// 64 KB of pseudo-random bytes (written by build.rs) — looks exactly like encrypted data.
static RANDOM_BLOB: &[u8] = include_bytes!(concat!(env!("OUT_DIR"), "/random.bin"));

/// 32 KB of (almost) zeros stored in the file — shows up as dark padding on the entropy map.
/// The one non-zero byte stops the compiler moving it to .bss, which takes no space on disk.
static ZEROS: [u8; 32 * 1024] = {
    let mut a = [0u8; 32 * 1024];
    a[32 * 1024 - 1] = 1;
    a
};

const STATUS_URL: &str = "https://example.com/api/v1/status";
const CONFIG_PATH: &str = r"C:\ProgramData\GlassbinDemo\config.toml";
const LOG_PATH: &str = "/var/log/glassbin-demo/app.log";
const GREETING: &str = "Hello from the glassbin demo program! Nothing to see here.";

fn main() {
    println!("{GREETING}");
    println!("Config would live at {CONFIG_PATH}, logs at {LOG_PATH}.");

    // Touch the blobs so the compiler keeps them in the binary.
    // black_box hides the data from the optimizer, so it can't precompute the sum and drop the arrays.
    let blob = std::hint::black_box(RANDOM_BLOB);
    let zeros = std::hint::black_box(&ZEROS);
    let checksum: u32 = blob.iter().chain(zeros.iter()).map(|&b| b as u32).sum();
    println!("Embedded data checksum: {checksum}");

    // Only runs if you pass --ping. Its purpose is to make the binary import network functions.
    if std::env::args().any(|a| a == "--ping") {
        match ping() {
            Ok(n) => println!("Got {n} bytes from {STATUS_URL}"),
            Err(e) => println!("Ping failed: {e}"),
        }
    }
}

fn ping() -> std::io::Result<usize> {
    let mut stream = TcpStream::connect("example.com:80")?;
    stream.write_all(b"GET /api/v1/status HTTP/1.0\r\nHost: example.com\r\n\r\n")?;
    let mut buf = Vec::new();
    stream.read_to_end(&mut buf)
}
