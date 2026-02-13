import { spawnSync } from 'child_process'
import { tmpdir } from 'os'

export const isWindows = process.platform === 'win32'
export const isMac = process.platform === 'darwin'

function commandExists(command: string): boolean {
  const lookup = isWindows ? 'where' : 'which'
  try {
    const result = spawnSync(lookup, [command], { stdio: 'ignore' })
    return result.status === 0
  } catch {
    return false
  }
}

export function resolveDefaultShell(): string {
  if (isWindows) {
    const windowsShells = ['pwsh.exe', 'powershell.exe', 'cmd.exe']
    for (const shell of windowsShells) {
      if (commandExists(shell)) return shell
    }
    return 'cmd.exe'
  }

  return process.env.SHELL || '/bin/zsh'
}

export function toPosixPath(p: string): string {
  return p.replace(/\\/g, '/')
}

export function basenameSafe(p: string): string {
  const normalized = p.replace(/[\\/]+$/g, '')
  const segments = normalized.split(/[\\/]/)
  return segments[segments.length - 1] || normalized
}

export function formatShortcut(mac: string, win: string): string {
  return isWindows ? win : mac
}

export function getTempDir(): string {
  return tmpdir()
}
