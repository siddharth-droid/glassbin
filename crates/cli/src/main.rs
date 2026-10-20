use std::{collections::BTreeMap, env, fs, process};

use glassbin_core::{
    BinaryInfo, block_entropy, drop_repeated, extract_strings, is_meaningful, parse, shannon_entropy,
};

const BLOCK_SIZE: usize = 4096;
const MIN_STRING_LEN: usize = 6;
/// A string seen more often than this is a code pattern, not text.
const MAX_REPEATS: usize = 3;

fn main() {
    let Some(path) = env::args().nth(1) else {
        eprintln!("usage: glassbin <file>");
        process::exit(2);
    };

    // `fs::read` returns a Result: Ok(bytes) or Err(io error). We handle the error
    // explicitly instead of crashing with a panic.
    let bytes = match fs::read(&path) {
        Ok(b) => b,
        Err(e) => {
            eprintln!("error: could not read {path}: {e}");
            process::exit(1);
        }
    };

    println!("file      {path}");
    println!("size      {} bytes", bytes.len());
    println!("entropy   {:.3} bits/byte", shannon_entropy(&bytes));

    // Not every file is an executable — entropy and strings still work on anything,
    // so a parse failure is a note, not a fatal error.
    match parse(&bytes) {
        Ok(info) => print_structure(&info),
        Err(e) => println!("format    {e}"),
    }

    println!("\nentropy map ({BLOCK_SIZE}-byte blocks):");
    println!("{}", sparkline(&block_entropy(&bytes, BLOCK_SIZE)));

    let strings: Vec<_> = extract_strings(&bytes, MIN_STRING_LEN)
        .into_iter()
        .filter(|s| is_meaningful(&s.text))
        .collect();
    let strings = drop_repeated(strings, MAX_REPEATS);
    println!("\nstrings   {} found (showing first 15)", strings.len());
    for s in strings.iter().take(15) {
        println!("  0x{:08x}  {}", s.offset, truncate(&s.text, 70));
    }
}

fn print_structure(info: &BinaryInfo) {
    let bits = if info.is_64 { 64 } else { 32 };
    println!("format    {} · {} · {bits}-bit", info.format, info.arch);
    println!("entry     0x{:x}", info.entry_point);
    if let Some(signed) = info.signed {
        println!(
            "signed    {}",
            if signed { "yes (signature present)" } else { "no" }
        );
    }
    let protections: Vec<String> = info
        .protections
        .iter()
        .map(|p| format!("{} {}", if p.enabled { "+" } else { "-" }, p.name))
        .collect();
    println!("protect   {}", protections.join("  "));

    println!("\nsections ({}):", info.sections.len());
    println!(
        "  {:<24} {:>10} {:>10} {:>8}  ",
        "name", "offset", "size", "entropy"
    );
    for s in &info.sections {
        println!(
            "  {:<24} {:>#10x} {:>10} {:>8.2}  {}",
            truncate(&s.name, 24),
            s.file_offset,
            s.file_size,
            s.entropy,
            entropy_label(s.entropy, s.file_size),
        );
    }

    // Group imports by library. BTreeMap keeps keys sorted, so output is stable.
    let mut by_lib: BTreeMap<&str, Vec<&str>> = BTreeMap::new();
    for imp in &info.imports {
        let lib = imp.library.as_deref().unwrap_or("(dynamic)");
        by_lib.entry(lib).or_default().push(&imp.name);
    }
    println!(
        "\nimports   {} functions from {} libraries",
        info.imports.len(),
        info.libraries.len()
    );
    for (lib, names) in &by_lib {
        let preview: Vec<&str> = names.iter().take(4).copied().collect();
        let more = names.len().saturating_sub(preview.len());
        let suffix = if more > 0 {
            format!(" +{more} more")
        } else {
            String::new()
        };
        println!("  {lib:<36} {}{suffix}", preview.join(", "));
    }

    if !info.exports.is_empty() {
        println!("\nexports   {}", info.exports.len());
        for name in info.exports.iter().take(10) {
            println!("  {name}");
        }
    }
}

/// Plain-English reading of a section's entropy.
fn entropy_label(entropy: f64, size: u64) -> &'static str {
    match entropy {
        _ if size == 0 => "(no file data)",
        e if e >= 7.5 => "compressed / encrypted?",
        e if e >= 5.5 => "code / binary data",
        e if e >= 3.0 => "text / structured data",
        _ => "mostly padding",
    }
}

/// Draw entropy values (0–8) as a row of block characters — a terminal preview
/// of the heatmap the web UI will render.
fn sparkline(values: &[f64]) -> String {
    const BARS: [char; 8] = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
    values
        .iter()
        .map(|v| BARS[((v / 8.0) * 7.0).round().clamp(0.0, 7.0) as usize])
        .collect::<Vec<_>>()
        .chunks(80)
        .map(|row| row.iter().collect::<String>())
        .collect::<Vec<_>>()
        .join("\n")
}

fn truncate(s: &str, max: usize) -> String {
    if s.chars().count() <= max {
        s.to_string()
    } else {
        format!("{}…", s.chars().take(max.saturating_sub(1)).collect::<String>())
    }
}
