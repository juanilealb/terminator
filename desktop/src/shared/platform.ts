import { spawnSync } from 'child_process'
import { tmpdir } from 'os'

export const isWindows = true

function commandExists(command: string): boolean {
  try {
    const result = spawnSync('where', [command], { stdio: 'ignore' })
    return result.status === 0
  } catch {
    return false
  }
}

export function resolveDefaultShell(): string {
  const windowsShells = ['pwsh.exe', 'powershell.exe', 'cmd.exe']
  for (const shell of windowsShells) {
    if (commandExists(shell)) return shell
  }
  return 'cmd.exe'
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
