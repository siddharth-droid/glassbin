import type { Import } from '../types'

// Infer what a program can *do* from the system functions it imports.
// This is the same first step a malware analyst takes — and it works without running the file.

interface Rule {
  tag: string
  notable?: boolean
  re: RegExp
}

const RULES: Rule[] = [
  { tag: 'Network', re: /^(Internet|WinHttp|Http(Open|Send)|WSA|URLDownload|socket$|connect$|send$|recv$|getaddrinfo$|curl_)/ },
  { tag: 'Process control', re: /^(CreateProcess|OpenProcess|TerminateProcess|ShellExecute|WinExec|fork$|execv|execl|posix_spawn|system$)/ },
  { tag: 'Memory injection', notable: true, re: /^(VirtualAllocEx|WriteProcessMemory|CreateRemoteThread|NtMapViewOfSection|QueueUserAPC|SetThreadContext)/ },
  { tag: 'Anti-debugging', notable: true, re: /^(IsDebuggerPresent|CheckRemoteDebuggerPresent|NtQueryInformationProcess|ptrace$)/ },
  { tag: 'Keyboard / clipboard', notable: true, re: /^(GetAsyncKeyState|SetWindowsHookEx|GetClipboardData|SetClipboardData|OpenClipboard)/ },
  { tag: 'Screen capture', re: /^(BitBlt|CreateCompatibleBitmap|PrintWindow|CGWindowListCreateImage)/ },
  { tag: 'Cryptography', re: /^(Crypt|BCrypt|NCrypt|EVP_|SSL_|RAND_bytes|CC(Crypt|Hmac|SHA|MD5))/ },
  { tag: 'Registry', re: /^Reg(Open|Create|Set|Query|Get|Delete|Enum)/ },
  { tag: 'File system', re: /^(CreateFile|ReadFile|WriteFile|DeleteFile|MoveFile|CopyFile|FindFirstFile|fopen$|open$|openat$|unlink$|rename$)/ },
  { tag: 'Dynamic loading', re: /^(LoadLibrary|GetProcAddress|LdrLoadDll|dlopen$|dlsym$)/ },
  { tag: 'Windows UI', re: /^(CreateWindow|RegisterClass|DialogBox|MessageBox|BeginPaint|ShowWindow)/ },
  { tag: 'Threads', re: /^(CreateThread|pthread_create$|_beginthread)/ },
]

export interface Capability {
  tag: string
  notable: boolean
  functions: string[]
}

export function detectCapabilities(imports: Import[]): Capability[] {
  const found = new Map<string, Capability>()
  for (const imp of imports) {
    // Mach-O symbol names start with an underscore (`_open`) — strip it before matching.
    const name = imp.name.replace(/^_+/, '')
    for (const rule of RULES) {
      if (!rule.re.test(name)) continue
      const cap = found.get(rule.tag) ?? { tag: rule.tag, notable: !!rule.notable, functions: [] }
      if (!cap.functions.includes(name)) cap.functions.push(name)
      found.set(rule.tag, cap)
    }
  }
  // Notable ones first, then by how much evidence we have.
  return [...found.values()].sort(
    (a, b) => Number(b.notable) - Number(a.notable) || b.functions.length - a.functions.length,
  )
}

export type StringKind = 'url' | 'path' | 'library' | 'text'

export function classifyString(s: string): StringKind {
  if (/https?:\/\/|wss?:\/\//i.test(s)) return 'url'
  if (/\.(dll|so(\.\d+)*|dylib|sys)\b/i.test(s)) return 'library'
  if (/^[A-Za-z]:\\|\\\\|^\/(usr|etc|home|var|lib|opt|tmp|System|Library|Applications)\//.test(s)) return 'path'
  return 'text'
}
