import * as pty from 'node-pty'
import { execFileSync } from 'child_process'
import { mkdirSync, unlinkSync, writeFileSync } from 'fs'
import { join } from 'path'
import { WebContents } from 'electron'
import { IPC } from '../shared/ipc-channels'
import { basenameSafe, getTempDir, resolveDefaultShell, toPosixPath } from '../shared/platform'

interface PtyInstance {
  process: pty.IPty
  webContents: WebContents
  onExitCallbacks: Array<(exitCode: number) => void>
  cols: number
  rows: number
  workspaceId?: string
}

interface ProcessEntry {
  pid: number
  command: string
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      const next = line[i + 1]
      if (inQuotes && next === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (char === ',' && !inQuotes) {
      fields.push(current)
      current = ''
      continue
    }

    current += char
  }

  fields.push(current)
  return fields.map((field) => field.trim())
}

function parseTasklistOutput(output: string): ProcessEntry[] {
  const entries: ProcessEntry[] = []
  for (const rawLine of output.split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('INFO:')) continue
    const columns = parseCsvLine(line)
    const pid = Number(columns[1])
    if (!columns[0] || Number.isNaN(pid)) continue
    entries.push({
      pid,
      command: columns[0],
    })
  }
  return entries
}

function isLikelyCodexCommand(command: string): boolean {
  const tokens = command.trim().split(/\s+/)
  if (tokens.length === 0) return false

  const stripQuotes = (token: string): string => token.replace(/^['"]|['"]$/g, '')
  const basenameNoLauncherExt = (token: string): string =>
    basenameSafe(token.toLowerCase()).replace(/\.(exe|cmd|bat|ps1)$/, '')

  const firstRaw = stripQuotes(tokens[0] ?? '')
  const secondRaw = stripQuotes(tokens[1] ?? '')
  const first = firstRaw.toLowerCase()
  const second = secondRaw.toLowerCase()

  const isCodexPathToken = (token: string): boolean => {
    if (!token) return false
    const basename = basenameSafe(token.toLowerCase())
    const withoutExt = basename.replace(/\.(exe|cmd|bat|ps1)$/, '')
    return withoutExt === 'codex' || basename === 'codex.js' || basename.startsWith('codex-')
  }

  if (isCodexPathToken(first)) return true

  const firstBin = basenameNoLauncherExt(firstRaw)
  const nodeOrBun = firstBin === 'node' || firstBin === 'bun'
  if (nodeOrBun && isCodexPathToken(second)) return true

  const firstPosix = toPosixPath(first)
  return firstPosix.includes('/codex/') && (
    firstPosix.endsWith('/codex') ||
    firstPosix.endsWith('/codex.exe') ||
    firstPosix.endsWith('/codex.cmd')
  )
}

const ACTIVITY_DIR = join(getTempDir(), 'constellagent-activity')
const CODEX_MARKER_SEGMENT = '.codex.'

export class PtyManager {
  private ptys = new Map<string, PtyInstance>()
  private nextId = 0

  create(workingDir: string, webContents: WebContents, shell?: string, command?: string[], initialWrite?: string, extraEnv?: Record<string, string>): string {
    const id = `pty-${++this.nextId}`

    let file: string
    let args: string[]
    if (command && command.length > 0) {
      file = command[0]
      args = command.slice(1)
    } else {
      file = (shell && shell.trim()) || resolveDefaultShell()
      args = []
    }

    const proc = pty.spawn(file, args, {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: workingDir,
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
        ...extraEnv,
      } as Record<string, string>,
    })

    let pendingWrite = initialWrite
    proc.onData((data) => {
      if (!instance.webContents.isDestroyed()) {
        instance.webContents.send(`${IPC.PTY_DATA}:${id}`, data)
      }
      // Write initial command on first output (shell is ready)
      if (pendingWrite) {
        const toWrite = pendingWrite
        pendingWrite = undefined
        proc.write(toWrite)
      }
    })

    const instance: PtyInstance = {
      process: proc,
      webContents,
      onExitCallbacks: [],
      cols: 80,
      rows: 24,
      workspaceId: extraEnv?.AGENT_ORCH_WS_ID,
    }

    proc.onExit(({ exitCode }) => {
      this.clearCodexWorkspaceActivity(instance.workspaceId, instance.process.pid)
      for (const cb of instance.onExitCallbacks) cb(exitCode)
      this.ptys.delete(id)
    })

    this.ptys.set(id, instance)
    return id
  }

  onExit(ptyId: string, callback: (exitCode: number) => void): void {
    const instance = this.ptys.get(ptyId)
    if (instance) instance.onExitCallbacks.push(callback)
  }

  write(ptyId: string, data: string): void {
    const instance = this.ptys.get(ptyId)
    if (!instance) return

    // Codex doesn't expose a prompt-submit hook, so mark the workspace active
    // when Enter is sent while a Codex process is already running in this PTY.
    if (instance.workspaceId && /[\r\n]/.test(data) && this.isCodexRunningUnder(instance.process.pid)) {
      this.markCodexWorkspaceActive(instance.workspaceId, instance.process.pid)
    }

    instance.process.write(data)
  }

  resize(ptyId: string, cols: number, rows: number): void {
    const instance = this.ptys.get(ptyId)
    if (instance) {
      instance.cols = cols
      instance.rows = rows
      instance.process.resize(cols, rows)
    }
  }

  destroy(ptyId: string): void {
    const instance = this.ptys.get(ptyId)
    if (instance) {
      this.clearCodexWorkspaceActivity(instance.workspaceId, instance.process.pid)
      instance.process.kill()
      this.ptys.delete(ptyId)
    }
  }

  /** Return IDs of all live PTY processes */
  list(): string[] {
    return Array.from(this.ptys.keys())
  }

  private isCodexRunningUnder(rootPid: number): boolean {
    let processTable = ''
    try {
      processTable = execFileSync('tasklist', ['/FO', 'CSV', '/NH'], { encoding: 'utf-8' })
    } catch {
      return false
    }

    const entries = parseTasklistOutput(processTable)
    if (entries.length === 0) return false

    // tasklist doesn't expose PPIDs, so treat Codex process presence as
    // best-effort activity once this PTY PID is known alive.
    const rootExists = entries.some((entry) => entry.pid === rootPid)
    return rootExists && entries.some((entry) => isLikelyCodexCommand(entry.command))
  }

  private codexMarkerPath(workspaceId: string, ptyPid: number): string {
    return join(ACTIVITY_DIR, `${workspaceId}${CODEX_MARKER_SEGMENT}${ptyPid}`)
  }

  private markCodexWorkspaceActive(workspaceId: string, ptyPid: number): void {
    try {
      mkdirSync(ACTIVITY_DIR, { recursive: true })
      writeFileSync(this.codexMarkerPath(workspaceId, ptyPid), '')
    } catch {
      // Best-effort marker write
    }
  }

  private clearCodexWorkspaceActivity(workspaceId: string | undefined, ptyPid: number): void {
    if (!workspaceId) return
    try {
      unlinkSync(this.codexMarkerPath(workspaceId, ptyPid))
    } catch {
      // Best-effort marker removal
    }
  }

  /** Update the webContents reference for an existing PTY (e.g. after renderer reload) */
  reattach(ptyId: string, webContents: WebContents): boolean {
    const instance = this.ptys.get(ptyId)
    if (!instance) return false
    instance.webContents = webContents

    // Nudge width to force a terminal redraw after renderer reattach.
    try {
      instance.process.resize(instance.cols + 1, instance.rows)
      instance.process.resize(instance.cols, instance.rows)
    } catch {}
    return true
  }

  destroyAll(): void {
    for (const [id] of this.ptys) {
      this.destroy(id)
    }
  }
}
