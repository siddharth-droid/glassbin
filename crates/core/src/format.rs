//! Parse an executable's structure (format, architecture, sections, imports, exports)
//! into one format-neutral summary. The three big formats:
//!   PE      Windows (.exe, .dll)
//!   ELF     Linux, Android
//!   Mach-O  macOS, iOS
//!
//! `goblin` does the heavy lifting; our job is to flatten its three different shapes
//! into one `BinaryInfo` the CLI and UI can render without caring which format it was.

use std::fmt;

use goblin::{Object, elf, mach, pe};

use crate::entropy::shannon_entropy;
use crate::security::{self, Protection};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize), serde(rename_all = "lowercase"))]
pub enum Format {
    Pe,
    Elf,
    MachO,
}

impl fmt::Display for Format {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(match self {
            Format::Pe => "PE (Windows)",
            Format::Elf => "ELF (Linux)",
            Format::MachO => "Mach-O (macOS)",
        })
    }
}

#[derive(Debug, Clone)]
#[cfg_attr(feature = "serde", derive(serde::Serialize), serde(rename_all = "camelCase"))]
pub struct Section {
    pub name: String,
    /// Where the section's bytes live in the file.
    pub file_offset: u64,
    pub file_size: u64,
    /// Where the section is placed in memory once loaded.
    pub virtual_address: u64,
    pub entropy: f64,
}

#[derive(Debug, Clone)]
#[cfg_attr(feature = "serde", derive(serde::Serialize), serde(rename_all = "camelCase"))]
pub struct Import {
    /// The library it comes from, e.g. `KERNEL32.dll`. Not always known for ELF.
    pub library: Option<String>,
    pub name: String,
}

#[derive(Debug, Clone)]
#[cfg_attr(feature = "serde", derive(serde::Serialize), serde(rename_all = "camelCase"))]
pub struct BinaryInfo {
    pub format: Format,
    pub arch: String,
    pub is_64: bool,
    pub entry_point: u64,
    pub sections: Vec<Section>,
    pub libraries: Vec<String>,
    pub imports: Vec<Import>,
    pub exports: Vec<String>,
    /// Exploit mitigations (ASLR, DEP, PIE, …) and whether each is on.
    pub protections: Vec<Protection>,
    /// PE only: whether an Authenticode signature is attached (not whether it's valid).
    pub signed: Option<bool>,
    /// PE only: the build time stamped by the linker, in Unix seconds. Easily faked, and some
    /// toolchains write a hash here instead, so treat it as a hint.
    pub build_time: Option<u32>,
    /// PE only: a .NET assembly.
    pub dotnet: bool,
    /// ELF only: the symbol table has been removed.
    pub stripped: Option<bool>,
}

/// Our own error type. Callers get one enum to `match` on, instead of goblin's internals.
#[derive(Debug)]
pub enum ParseError {
    /// The bytes claim to be a known format but are malformed.
    Malformed(goblin::error::Error),
    /// Valid file, but not something we analyze (yet).
    Unsupported(&'static str),
}

impl fmt::Display for ParseError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ParseError::Malformed(e) => write!(f, "malformed binary: {e}"),
            ParseError::Unsupported(what) => write!(f, "unsupported file: {what}"),
        }
    }
}

impl std::error::Error for ParseError {}

// Implementing `From` lets us use `?` on goblin results: the error converts automatically.
impl From<goblin::error::Error> for ParseError {
    fn from(e: goblin::error::Error) -> Self {
        ParseError::Malformed(e)
    }
}

/// Detect the format and parse it.
pub fn parse(bytes: &[u8]) -> Result<BinaryInfo, ParseError> {
    match Object::parse(bytes)? {
        Object::PE(pe) => Ok(from_pe(&pe, bytes)),
        Object::Elf(elf) => Ok(from_elf(&elf, bytes)),
        Object::Mach(mach::Mach::Binary(macho)) => from_macho(&macho),
        Object::Mach(mach::Mach::Fat(_)) => Err(ParseError::Unsupported("universal (fat) Mach-O")),
        Object::Archive(_) => Err(ParseError::Unsupported("static library archive")),
        _ => Err(ParseError::Unsupported("not a PE, ELF or Mach-O executable")),
    }
}

/// Entropy of `bytes[offset..offset + size]`, or 0.0 if the range is out of bounds
/// (malformed files lie about their sizes: never trust them blindly).
fn range_entropy(bytes: &[u8], offset: u64, size: u64) -> f64 {
    let start = offset as usize;
    let end = start.saturating_add(size as usize);
    bytes.get(start..end).map_or(0.0, shannon_entropy)
}

/// Some Windows DLLs are commonly imported by *ordinal* (a number) instead of by name: the
/// Winsock library above all, which Rust's `std::net` uses. Its ordinals have been fixed since
/// Windows 95, so we can translate them back. Without this, networking code is invisible.
fn known_ordinal(dll: &str, ordinal: u16) -> Option<&'static str> {
    if !dll.eq_ignore_ascii_case("ws2_32.dll") && !dll.eq_ignore_ascii_case("wsock32.dll") {
        return None;
    }
    Some(match ordinal {
        1 => "accept",
        2 => "bind",
        3 => "closesocket",
        4 => "connect",
        5 => "getpeername",
        6 => "getsockname",
        7 => "getsockopt",
        8 => "htonl",
        9 => "htons",
        10 => "ioctlsocket",
        11 => "inet_addr",
        12 => "inet_ntoa",
        13 => "listen",
        14 => "ntohl",
        15 => "ntohs",
        16 => "recv",
        17 => "recvfrom",
        18 => "select",
        19 => "send",
        20 => "sendto",
        21 => "setsockopt",
        22 => "shutdown",
        23 => "socket",
        51 => "gethostbyaddr",
        52 => "gethostbyname",
        57 => "gethostname",
        111 => "WSAGetLastError",
        115 => "WSAStartup",
        116 => "WSACleanup",
        151 => "__WSAFDIsSet",
        _ => return None,
    })
}

fn from_pe(pe: &pe::PE, bytes: &[u8]) -> BinaryInfo {
    let sections = pe
        .sections
        .iter()
        .map(|s| Section {
            name: s.name().unwrap_or("?").to_string(),
            file_offset: s.pointer_to_raw_data as u64,
            file_size: s.size_of_raw_data as u64,
            virtual_address: s.virtual_address as u64,
            entropy: range_entropy(bytes, s.pointer_to_raw_data as u64, s.size_of_raw_data as u64),
        })
        .collect();

    let imports = pe
        .imports
        .iter()
        .map(|i| {
            // Imports by number have no name in the file; recover it where the number is well known.
            let name = match known_ordinal(i.dll, i.ordinal) {
                Some(known) if i.name.starts_with("ORDINAL ") => known.to_string(),
                _ => i.name.to_string(),
            };
            Import {
                library: Some(i.dll.to_string()),
                name,
            }
        })
        .collect();

    BinaryInfo {
        format: Format::Pe,
        arch: pe::header::machine_to_str(pe.header.coff_header.machine).to_string(),
        is_64: pe.is_64,
        entry_point: pe.entry as u64,
        sections,
        libraries: pe.libraries.iter().map(|s| s.to_string()).collect(),
        imports,
        exports: pe
            .exports
            .iter()
            .filter_map(|e| e.name.map(str::to_string))
            .collect(),
        protections: security::pe_protections(pe),
        signed: Some(security::pe_is_signed(pe)),
        build_time: Some(pe.header.coff_header.time_date_stamp).filter(|&t| t != 0),
        dotnet: security::pe_is_dotnet(pe),
        stripped: None,
    }
}

fn from_elf(elf: &elf::Elf, bytes: &[u8]) -> BinaryInfo {
    let sections = elf
        .section_headers
        .iter()
        .filter(|sh| sh.sh_name != 0) // index 0 is the empty null section
        .map(|sh| {
            // SHT_NOBITS (e.g. .bss) occupies memory but has no bytes in the file.
            let in_file = sh.sh_type != elf::section_header::SHT_NOBITS;
            Section {
                name: elf.shdr_strtab.get_at(sh.sh_name).unwrap_or("?").to_string(),
                file_offset: sh.sh_offset,
                file_size: if in_file { sh.sh_size } else { 0 },
                virtual_address: sh.sh_addr,
                entropy: if in_file {
                    range_entropy(bytes, sh.sh_offset, sh.sh_size)
                } else {
                    0.0
                },
            }
        })
        .collect();

    // Dynamic symbols: undefined ones are imports, defined global ones are exports.
    let mut imports = Vec::new();
    let mut exports = Vec::new();
    for sym in elf.dynsyms.iter() {
        let Some(name) = elf.dynstrtab.get_at(sym.st_name).filter(|n| !n.is_empty()) else {
            continue;
        };
        if sym.is_import() {
            imports.push(Import {
                library: None,
                name: name.to_string(),
            });
        } else if sym.st_bind() == elf::sym::STB_GLOBAL && sym.st_value != 0 {
            exports.push(name.to_string());
        }
    }

    BinaryInfo {
        format: Format::Elf,
        arch: elf::header::machine_to_str(elf.header.e_machine).to_string(),
        is_64: elf.is_64,
        entry_point: elf.entry,
        sections,
        libraries: elf.libraries.iter().map(|s| s.to_string()).collect(),
        imports,
        exports,
        protections: security::elf_protections(elf),
        signed: None,
        build_time: None,
        dotnet: false,
        stripped: Some(security::elf_is_stripped(elf)),
    }
}

fn from_macho(macho: &mach::MachO) -> Result<BinaryInfo, ParseError> {
    let mut sections = Vec::new();
    for segment in &macho.segments {
        // Each item is the section header plus a slice of its bytes.
        for (sect, data) in segment.sections()? {
            sections.push(Section {
                name: format!("{},{}", sect.segname().unwrap_or("?"), sect.name().unwrap_or("?")),
                file_offset: sect.offset as u64,
                file_size: data.len() as u64,
                virtual_address: sect.addr,
                entropy: shannon_entropy(data),
            });
        }
    }

    let imports = macho
        .imports()?
        .into_iter()
        .map(|i| Import {
            library: Some(i.dylib.to_string()),
            name: i.name.to_string(),
        })
        .collect();
    let exports = macho.exports()?.into_iter().map(|e| e.name).collect();

    let arch =
        mach::constants::cputype::get_arch_name_from_types(macho.header.cputype(), macho.header.cpusubtype())
            .unwrap_or("unknown");

    Ok(BinaryInfo {
        format: Format::MachO,
        arch: arch.to_string(),
        is_64: macho.is_64,
        entry_point: macho.entry,
        sections,
        libraries: macho
            .libs
            .iter()
            .filter(|l| **l != "self")
            .map(|s| s.to_string())
            .collect(),
        imports,
        exports,
        protections: security::macho_protections(macho),
        signed: None,
        build_time: None,
        dotnet: false,
        stripped: None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_its_own_test_binary() {
        // The test runner is itself an executable: PE on Windows, ELF on Linux,
        // Mach-O on macOS, so this test works on every platform.
        let bytes = std::fs::read(std::env::current_exe().unwrap()).unwrap();
        let info = parse(&bytes).expect("own executable should parse");
        assert!(!info.sections.is_empty());
        assert!(!info.imports.is_empty());
        assert!(info.entry_point > 0);
    }

    #[test]
    fn translates_winsock_ordinals_only() {
        assert_eq!(known_ordinal("WS2_32.dll", 16), Some("recv"));
        assert_eq!(known_ordinal("ws2_32.dll", 115), Some("WSAStartup"));
        assert_eq!(known_ordinal("WS2_32.dll", 9999), None);
        assert_eq!(known_ordinal("KERNEL32.dll", 16), None);
    }

    #[test]
    fn rejects_random_bytes() {
        let junk = b"definitely not an executable file, just text";
        assert!(parse(junk).is_err());
    }
}
