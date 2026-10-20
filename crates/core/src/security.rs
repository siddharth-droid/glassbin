//! Exploit mitigations a program was built with — the checks Microsoft's old BinScope ran.
//! Each one makes a whole class of attack harder; missing ones are worth a second look.

use goblin::{elf, mach, pe};

/// One mitigation and whether the binary has it.
#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize))]
pub struct Protection {
    /// Short, conventional name, e.g. "ASLR".
    pub name: &'static str,
    pub enabled: bool,
    /// One sentence on what it does, written for someone who hasn't met it before.
    pub about: &'static str,
}

fn p(name: &'static str, enabled: bool, about: &'static str) -> Protection {
    Protection { name, enabled, about }
}

pub(crate) fn pe_protections(pe: &pe::PE) -> Vec<Protection> {
    use pe::dll_characteristic::*;
    let Some(opt) = pe.header.optional_header else {
        return Vec::new();
    };
    let dc = opt.windows_fields.dll_characteristics;
    let has = |flag: u16| dc & flag != 0;
    let mut out = vec![
        p(
            "ASLR",
            has(IMAGE_DLLCHARACTERISTICS_DYNAMIC_BASE),
            "Loads at a random address each run, so attackers can't hardcode where code lives.",
        ),
        p(
            "DEP",
            has(IMAGE_DLLCHARACTERISTICS_NX_COMPAT),
            "Data in memory can't be executed as code.",
        ),
        p(
            "Control Flow Guard",
            has(IMAGE_DLLCHARACTERISTICS_GUARD_CF),
            "Checks indirect calls land on real function starts.",
        ),
    ];
    if pe.is_64 {
        out.insert(
            1,
            p(
                "High-entropy ASLR",
                has(IMAGE_DLLCHARACTERISTICS_HIGH_ENTROPY_VA),
                "Uses the full 64-bit address space for that randomness.",
            ),
        );
    }
    out
}

/// A PE carries an Authenticode signature in its certificate table. Present ≠ valid — checking
/// the chain needs the OS's trust store — but unsigned is still a useful fact.
pub(crate) fn pe_is_signed(pe: &pe::PE) -> bool {
    pe.header
        .optional_header
        .and_then(|o| o.data_directories.get_certificate_table().copied())
        .is_some_and(|d| d.size > 0)
}

/// .NET programs are mostly bytecode in one blob, so their imports and entropy read differently.
pub(crate) fn pe_is_dotnet(pe: &pe::PE) -> bool {
    pe.header
        .optional_header
        .and_then(|o| o.data_directories.get_clr_runtime_header().copied())
        .is_some_and(|d| d.size > 0)
}

pub(crate) fn elf_protections(elf: &elf::Elf) -> Vec<Protection> {
    use elf::program_header::{PF_X, PT_GNU_RELRO, PT_GNU_STACK};
    let ph = &elf.program_headers;
    // No PT_GNU_STACK at all means old toolchains' default: an executable stack.
    let nx = ph
        .iter()
        .find(|h| h.p_type == PT_GNU_STACK)
        .is_some_and(|h| h.p_flags & PF_X == 0);
    let pie = elf.header.e_type == elf::header::ET_DYN && elf.interpreter.is_some();
    let relro = ph.iter().any(|h| h.p_type == PT_GNU_RELRO);
    let bind_now = elf.dynamic.as_ref().is_some_and(|d| {
        d.dyns.iter().any(|x| x.d_tag == elf::dynamic::DT_BIND_NOW)
            || d.info.flags & elf::dynamic::DF_BIND_NOW != 0
            || d.info.flags_1 & elf::dynamic::DF_1_NOW != 0
    });
    let canary = elf.dynsyms.iter().chain(elf.syms.iter()).any(|s| {
        elf.dynstrtab.get_at(s.st_name) == Some("__stack_chk_fail")
            || elf.strtab.get_at(s.st_name) == Some("__stack_chk_fail")
    });
    vec![
        p(
            "PIE",
            pie,
            "Loads at a random address each run, so attackers can't hardcode where code lives.",
        ),
        p("NX stack", nx, "The stack can't be executed as code."),
        p(
            "Full RELRO",
            relro && bind_now,
            "Function pointers used to call libraries are made read-only at startup.",
        ),
        p(
            "Stack canaries",
            canary,
            "Detects stack buffer overflows before a function returns.",
        ),
    ]
}

/// Without a symbol table there are no function names to read — normal for release builds,
/// but it makes analysis harder.
pub(crate) fn elf_is_stripped(elf: &elf::Elf) -> bool {
    elf.syms.is_empty()
}

pub(crate) fn macho_protections(macho: &mach::MachO) -> Vec<Protection> {
    let pie = macho.header.flags & mach::header::MH_PIE != 0;
    vec![p(
        "PIE",
        pie,
        "Loads at a random address each run, so attackers can't hardcode where code lives.",
    )]
}

#[cfg(test)]
mod tests {
    use crate::parse;

    #[test]
    fn own_binary_reports_protections() {
        // Modern Rust toolchains turn ASLR / PIE on by default on every platform.
        let bytes = std::fs::read(std::env::current_exe().unwrap()).unwrap();
        let info = parse(&bytes).unwrap();
        let aslr = info
            .protections
            .iter()
            .find(|p| p.name == "ASLR" || p.name == "PIE");
        assert!(aslr.is_some_and(|p| p.enabled), "{:?}", info.protections);
    }
}
