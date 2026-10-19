//! Find human-readable text hidden inside a binary — the same idea as the Unix `strings` tool.
//! Error messages, URLs, file paths and class names often reveal what a program does.

/// A run of printable ASCII found in the file.
#[derive(Debug, Clone, PartialEq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize))]
pub struct FoundString {
    /// Byte offset where the string starts.
    pub offset: usize,
    pub text: String,
}

fn is_printable(b: u8) -> bool {
    // Space through '~', plus tab.
    (0x20..=0x7e).contains(&b) || b == b'\t'
}

/// Return every run of at least `min_len` printable ASCII bytes.
pub fn extract_strings(bytes: &[u8], min_len: usize) -> Vec<FoundString> {
    let mut found = Vec::new();
    // `Option<usize>`: either we're inside a run (Some(start)) or we're not (None).
    let mut start: Option<usize> = None;

    for (i, &b) in bytes.iter().enumerate() {
        match (is_printable(b), start) {
            (true, None) => start = Some(i),
            (false, Some(s)) => {
                push_if_long(&mut found, bytes, s, i, min_len);
                start = None;
            }
            _ => {}
        }
    }
    // A string may run right up to the end of the file.
    if let Some(s) = start {
        push_if_long(&mut found, bytes, s, bytes.len(), min_len);
    }
    found
}

/// Heuristic filter for noise: machine code often happens to contain printable bytes
/// (`u L97t`, `LcA<E3`). Real text is mostly letters, so keep strings that are at least
/// two-thirds alphabetic, and with some variety (`r?fffff.` is a constant, not text).
pub fn is_meaningful(text: &str) -> bool {
    let total = text.chars().count();
    let letters = text.chars().filter(|c| c.is_ascii_alphabetic()).count();
    let mut distinct: Vec<char> = text.chars().collect();
    distinct.sort_unstable();
    distinct.dedup();
    total > 0 && letters * 3 >= total * 2 && distinct.len() >= 5
}

/// Drop strings whose exact text appears more than `max_repeats` times. Real messages appear
/// once or twice; byte patterns that repeat everywhere are code. The classic example is
/// `UAWAVAUATVWSH` — x86-64 for "push these registers", the opening of many functions.
pub fn drop_repeated(strings: Vec<FoundString>, max_repeats: usize) -> Vec<FoundString> {
    use std::collections::HashMap;
    let mut counts: HashMap<&str, usize> = HashMap::new();
    for s in &strings {
        *counts.entry(s.text.as_str()).or_default() += 1;
    }
    // `counts` borrows from `strings`, so decide what to keep first, then consume `strings`.
    let keep: Vec<bool> = strings
        .iter()
        .map(|s| counts[s.text.as_str()] <= max_repeats)
        .collect();
    strings
        .into_iter()
        .zip(keep)
        .filter_map(|(s, k)| k.then_some(s))
        .collect()
}

fn push_if_long(found: &mut Vec<FoundString>, bytes: &[u8], start: usize, end: usize, min_len: usize) {
    if end - start >= min_len {
        // Safe: every byte in the range is printable ASCII, which is valid UTF-8.
        let text = String::from_utf8_lossy(&bytes[start..end]).into_owned();
        found.push(FoundString { offset: start, text });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_strings_between_binary_noise() {
        let data = b"\x00\x01hello world\x00\xffhi\x00https://example.com";
        let found = extract_strings(data, 4);
        let texts: Vec<&str> = found.iter().map(|s| s.text.as_str()).collect();
        assert_eq!(texts, ["hello world", "https://example.com"]);
        assert_eq!(found[0].offset, 2);
    }

    #[test]
    fn meaningful_keeps_words_drops_noise() {
        assert!(is_meaningful("CalculatorStarted"));
        assert!(is_meaningful("https://example.com"));
        assert!(!is_meaningful("u*9Q<|%"));
        assert!(!is_meaningful("D$,D8-"));
        assert!(!is_meaningful(""));
        assert!(!is_meaningful("ffffff."));
        assert!(!is_meaningful("r?fffff."));
        assert!(!is_meaningful("L;7u H"));
        assert!(is_meaningful("!This program cannot be run in DOS mode."));
        assert!(is_meaningful("KERNEL32.dll"));
    }

    #[test]
    fn drops_strings_that_repeat_too_often() {
        let s = |offset, text: &str| FoundString {
            offset,
            text: text.to_string(),
        };
        let input = vec![
            s(0, "UAWAVAUATVWSH"),
            s(10, "Hello there"),
            s(20, "UAWAVAUATVWSH"),
            s(30, "UAWAVAUATVWSH"),
        ];
        let kept = drop_repeated(input, 2);
        assert_eq!(kept, vec![s(10, "Hello there")]);
    }

    #[test]
    fn respects_min_len() {
        assert!(extract_strings(b"abc\x00", 4).is_empty());
        assert_eq!(extract_strings(b"abcd\x00", 4).len(), 1);
    }
}
