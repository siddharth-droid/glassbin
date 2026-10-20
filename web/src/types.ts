// Mirrors the `Report` struct in crates/wasm/src/lib.rs (serde renames fields to camelCase).

export type Format = 'pe' | 'elf' | 'macho'

export interface Section {
  name: string
  fileOffset: number
  fileSize: number
  virtualAddress: number
  entropy: number
}

export interface Import {
  library: string | null
  name: string
}

export interface BinaryInfo {
  format: Format
  arch: string
  is64: boolean
  entryPoint: number
  sections: Section[]
  libraries: string[]
  imports: Import[]
  exports: string[]
  protections: Protection[]
  /** PE only: an Authenticode signature is attached (not that it's valid). */
  signed: boolean | null
  /** PE only: linker build time, Unix seconds. A hint, easily faked. */
  buildTime: number | null
  dotnet: boolean
  /** ELF only: symbol table removed. */
  stripped: boolean | null
}

export interface Protection {
  name: string
  enabled: boolean
  about: string
}

export interface Hashes {
  sha256: string
  sha1: string
}

export interface FoundString {
  offset: number
  text: string
}

export interface Report {
  size: number
  entropy: number
  blockSize: number
  blocks: number[]
  binary: BinaryInfo | null
  parseError: string | null
  stringCount: number
  strings: FoundString[]
}

/** A byte range in the file, used to link the section map and the heatmap. */
export interface ByteRange {
  start: number
  end: number
}
