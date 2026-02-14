export const isWindows = true

export interface ShellProfile {
  shell: string
  args: string[]
  wslAvailable: boolean
}

export function isDebugLoggingEnabled(): boolean {
  return false
}

export function debugLog(_message: string, _details?: unknown): void {
  // no-op in renderer
}

export function resolveDefaultShell(): string {
  return resolveDefaultShellProfile().shell
}

export function defaultShellArgsFor(shell: string): string[] {
  const lower = shell.toLowerCase()
  if (lower.endsWith('cmd.exe') || lower === 'cmd' || lower === 'cmd.exe') {
    return ['/K', 'chcp 65001>nul']
  }
  if (
    lower.endsWith('pwsh.exe') ||
    lower === 'pwsh' ||
    lower === 'pwsh.exe' ||
    lower.endsWith('powershell.exe') ||
    lower === 'powershell' ||
    lower === 'powershell.exe'
  ) {
    return ['-NoLogo']
  }
  return []
}

export function resolveDefaultShellProfile(): ShellProfile {
  return {
    shell: 'cmd.exe',
    args: defaultShellArgsFor('cmd.exe'),
    wslAvailable: false,
  }
}

export function toPosixPath(p: string): string {
  return p.replace(/\\/g, '/')
}

export function basenameSafe(p: string): string {
  const normalized = p.replace(/[\\/]+$/g, '')
  const segments = normalized.split(/[\\/]/)
  return segments[segments.length - 1] || normalized
}

export function formatShortcut(_mac: string, win: string): string {
  return win
}

export function getTempDir(): string {
  if (typeof process !== 'undefined' && process.env) {
    return process.env.TEMP || process.env.TMP || 'C:/Temp'
  }

  return 'C:/Temp'
}
