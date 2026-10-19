//! binscope-core: the analysis engine shared by the CLI, the browser (WASM) and the server.
//!
//! Everything here works on `&[u8]` — a *borrowed* slice of bytes. Functions read the
//! file's bytes without taking ownership or copying them, which is what makes this fast.

pub mod entropy;
pub mod format;
pub mod strings;

pub use entropy::{block_entropy, shannon_entropy, windowed_entropy};
pub use format::{parse, BinaryInfo, Format, Import, ParseError, Section};
pub use strings::{drop_repeated, extract_strings, is_meaningful, FoundString};
