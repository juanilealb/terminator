import { spawnSync } from 'child_process'
import { tmpdir } from 'os'

export const isWindows = true
const DEBUG_PREFIX = '[Terminator]'
let cachedDebugEnabled: boolean | null = null
let cachedDefaultShell: string | null = null
let didLogShellResolution = false

export function isDebugLoggingEnabled(): boolean {
  if (cachedDebugEnabled !== null) return cachedDebugEnabled
  cachedDebugEnabled =
    typeof process !== 'undefined'
    && !!process.env
    && process.env.TERMINATOR_DEBUG === '1'
  return cachedDebugEnabled
}

export function debugLog(message: string, details?: unknown): void {
  if (!isDebugLoggingEnabled()) return
  if (details === undefined) {
    console.log(`${DEBUG_PREFIX} ${message}`)
    return
  }
  console.log(`${DEBUG_PREFIX} ${message}`, details)
}

function commandExists(command: string): boolean {
  try {
    const result = spawnSync('where', [command], { stdio: 'ignore' })
    return result.status === 0
  } catch {
    return false
  }
}

export function resolveDefaultShell(): string {
  if (cachedDefaultShell) return cachedDefaultShell

  const windowsShells = ['pwsh.exe', 'powershell.exe', 'cmd.exe']
  let resolved = 'cmd.exe'
  for (const shell of windowsShells) {
    if (commandExists(shell)) {
      resolved = shell
      break
    }
  }

  cachedDefaultShell = resolved
  if (!didLogShellResolution) {
    didLogShellResolution = true
    debugLog('Resolved default shell', { shell: resolved, candidates: windowsShells })
  }
  return resolved
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
  return tmpdir()
}
