import * as pty from 'node-pty'
import { execFileSync } from 'child_process'
import { mkdirSync, unlinkSync, writeFileSync } from 'fs'
import { join } from 'path'
import { WebContents } from 'electron'
import { IPC } from '../shared/ipc-channels'
import { basenameSafe, debugLog, getTempDir, resolveDefaultShell, toPosixPath } from '@shared/platform'

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
  parentPid?: number
  name: string
  commandLine: string
}

type ProcessSnapshotSource = 'powershell' | 'tasklist' | 'none'

interface ProcessSnapshot {
  at: number
  source: ProcessSnapshotSource
  entries: ProcessEntry[]
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
    const name = columns[0] ?? ''
    if (!name || Number.isNaN(pid)) continue
    entries.push({
      pid,
      name,
      commandLine: name,
    })
  }
  return entries
}

function parsePowerShellProcessOutput(output: string): ProcessEntry[] {
  const trimmed = output.replace(/^\uFEFF/, '').trim()
  if (!trimmed || trimmed === 'null') return []

  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    return []
  }

  const rows = Array.isArray(parsed) ? parsed : [parsed]
  const entries: ProcessEntry[] = []
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue
    const rec = row as Record<string, unknown>
    const pid = Number(rec.ProcessId)
    const parentPidRaw = Number(rec.ParentProcessId)
    const name = typeof rec.Name === 'string' ? rec.Name : ''
    const commandLine = typeof rec.CommandLine === 'string' && rec.CommandLine
      ? rec.CommandLine
      : name

    if (!Number.isFinite(pid) || pid <= 0) continue
    entries.push({
      pid,
      parentPid: Number.isFinite(parentPidRaw) && parentPidRaw > 0 ? parentPidRaw : undefined,
      name,
      commandLine,
    })
  }

  return entries
}

function readProcessesViaPowerShell(): ProcessEntry[] {
  try {
    const script = "$ErrorActionPreference='Stop'; Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,CommandLine | ConvertTo-Json -Compress"
    const output = execFileSync(
      'powershell.exe',
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      {
        encoding: 'utf-8',
        windowsHide: true,
        maxBuffer: 16 * 1024 * 1024,
      },
    )
    return parsePowerShellProcessOutput(output)
  } catch {
    return []
  }
}

function readProcessesViaTasklist(): ProcessEntry[] {
  try {
    const output = execFileSync('tasklist', ['/FO', 'CSV', '/NH'], {
      encoding: 'utf-8',
      windowsHide: true,
    })
    return parseTasklistOutput(output)
  } catch {
    return []
  }
}

function collectDescendantPids(rootPid: number, entries: ProcessEntry[]): Set<number> {
  const childrenByParent = new Map<number, number[]>()
  for (const entry of entries) {
    if (entry.parentPid === undefined) continue
    const list = childrenByParent.get(entry.parentPid) ?? []
    list.push(entry.pid)
    childrenByParent.set(entry.parentPid, list)
  }

  const descendants = new Set<number>([rootPid])
  const queue = [rootPid]

  while (queue.length > 0) {
    const parent = queue.shift()
    if (parent === undefined) continue
    const children = childrenByParent.get(parent)
    if (!children) continue

    for (const childPid of children) {
      if (descendants.has(childPid)) continue
      descendants.add(childPid)
      queue.push(childPid)
    }
  }

  return descendants
}

function isLikelyCodexCommand(command: string): boolean {
  const tokens = command.trim().split(/\s+/)
  if (tokens.length === 0) return false

  const stripQuotes = (token: string): string => token.replace(/^['"]|['"]$/g, '')
  const basenameNoLauncherExt = (token: string): string =>
    basenameSafe(token.toLowerCase()).replace(/\.(exe|cmd|bat|ps1|com)$/, '')

  const firstRaw = stripQuotes(tokens[0] ?? '')
  const secondRaw = stripQuotes(tokens[1] ?? '')
  const first = firstRaw.toLowerCase()

  const isCodexPathToken = (token: string): boolean => {
    if (!token) return false
    const base = basenameSafe(token.toLowerCase())
    const withoutExt = base.replace(/\.(exe|cmd|bat|ps1|com)$/, '')
    return withoutExt === 'codex' || base === 'codex.js' || base.startsWith('codex-')
  }

  if (isCodexPathToken(first)) return true

  const firstBin = basenameNoLauncherExt(firstRaw)
  const nodeOrBun = firstBin === 'node' || firstBin === 'bun'
  if (nodeOrBun && isCodexPathToken(secondRaw)) return true

  const firstPosix = toPosixPath(first)
  return firstPosix.includes('/codex/') && (
    firstPosix.endsWith('/codex') ||
    firstPosix.endsWith('/codex.exe') ||
    firstPosix.endsWith('/codex.cmd')
  )
}

function isLikelyCodexProcess(entry: ProcessEntry): boolean {
  return isLikelyCodexCommand(entry.commandLine) || isLikelyCodexCommand(entry.name)
}

function normalizePtyEnv(extraEnv?: Record<string, string>): Record<string, string> {
  const merged: Record<string, string | undefined> = {
    ...process.env,
    TERM: 'xterm-256color',
    COLORTERM: 'truecolor',
    ...extraEnv,
  }

  const normalized: Record<string, string> = {}
  for (const [key, value] of Object.entries(merged)) {
    if (typeof value === 'string') normalized[key] = value
  }
  return normalized
}

const ACTIVITY_DIR = join(getTempDir(), 'terminator-activity')
const CODEX_MARKER_SEGMENT = '.codex.'
const PROCESS_SNAPSHOT_TTL_MS = 1000

export class PtyManager {
  private ptys = new Map<string, PtyInstance>()
  private nextId = 0
  private processSnapshotCache: ProcessSnapshot | null = null

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
      env: normalizePtyEnv(extraEnv),
    })

    const instance: PtyInstance = {
      process: proc,
      webContents,
      onExitCallbacks: [],
      cols: 80,
      rows: 24,
      workspaceId: extraEnv?.AGENT_ORCH_WS_ID,
    }

    let pendingWrite = initialWrite
    const flushInitialWrite = (reason: 'first-output' | 'timer') => {
      if (!pendingWrite) return
      const toWrite = pendingWrite
      pendingWrite = undefined
      try {
        proc.write(toWrite)
        debugLog('PTY initial write sent', { ptyId: id, pid: proc.pid, reason })
      } catch (err) {
        debugLog('PTY initial write failed', { ptyId: id, pid: proc.pid, reason, error: err })
      }
    }

    const initialWriteTimer = pendingWrite
      ? setTimeout(() => flushInitialWrite('timer'), 750)
      : null

    proc.onData((data) => {
      if (!instance.webContents.isDestroyed()) {
        instance.webContents.send(`${IPC.PTY_DATA}:${id}`, data)
      }
      flushInitialWrite('first-output')
    })

    proc.onExit(({ exitCode }) => {
      if (initialWriteTimer) clearTimeout(initialWriteTimer)
      this.clearCodexWorkspaceActivity(instance.workspaceId, instance.process.pid)
      for (const cb of instance.onExitCallbacks) {
        try {
          cb(exitCode)
        } catch (err) {
          debugLog('PTY exit callback failed', { ptyId: id, pid: proc.pid, error: err })
        }
      }
      this.ptys.delete(id)
      debugLog('PTY exited', { ptyId: id, pid: proc.pid, exitCode })
    })

    this.ptys.set(id, instance)
    debugLog('PTY created', {
      ptyId: id,
      pid: proc.pid,
      shell: file,
      args,
      workingDir,
      workspaceId: instance.workspaceId ?? null,
    })
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
    if (!instance) return

    this.clearCodexWorkspaceActivity(instance.workspaceId, instance.process.pid)
    debugLog('Destroying PTY', {
      ptyId,
      pid: instance.process.pid,
      workspaceId: instance.workspaceId ?? null,
    })
    try {
      instance.process.kill()
    } catch (err) {
      debugLog('PTY kill failed', { ptyId, pid: instance.process.pid, error: err })
    }
    this.ptys.delete(ptyId)
  }

  /** Return IDs of all live PTY processes */
  list(): string[] {
    return Array.from(this.ptys.keys())
  }

  private getProcessSnapshot(): {
    entries: ProcessEntry[]
    source: ProcessSnapshotSource
    cached: boolean
  } {
    const now = Date.now()
    if (
      this.processSnapshotCache
      && (now - this.processSnapshotCache.at) <= PROCESS_SNAPSHOT_TTL_MS
    ) {
      return {
        entries: this.processSnapshotCache.entries,
        source: this.processSnapshotCache.source,
        cached: true,
      }
    }

    const psEntries = readProcessesViaPowerShell()
    if (psEntries.length > 0) {
      this.processSnapshotCache = {
        at: now,
        source: 'powershell',
        entries: psEntries,
      }
      return { entries: psEntries, source: 'powershell', cached: false }
    }

    const tasklistEntries = readProcessesViaTasklist()
    if (tasklistEntries.length > 0) {
      this.processSnapshotCache = {
        at: now,
        source: 'tasklist',
        entries: tasklistEntries,
      }
      return { entries: tasklistEntries, source: 'tasklist', cached: false }
    }

    this.processSnapshotCache = {
      at: now,
      source: 'none',
      entries: [],
    }
    return { entries: [], source: 'none', cached: false }
  }

  private isCodexRunningUnder(rootPid: number): boolean {
    const { entries, source, cached } = this.getProcessSnapshot()
    if (entries.length === 0) {
      debugLog('Codex process detection', {
        rootPid,
        source,
        cached,
        rootExists: false,
        codexDetected: false,
      })
      return false
    }

    const rootExists = entries.some((entry) => entry.pid === rootPid)
    if (!rootExists) {
      debugLog('Codex process detection', {
        rootPid,
        source,
        cached,
        rootExists: false,
        codexDetected: false,
      })
      return false
    }

    let codexDetected = false
    if (source === 'powershell') {
      const descendants = collectDescendantPids(rootPid, entries)
      codexDetected = entries.some((entry) => descendants.has(entry.pid) && isLikelyCodexProcess(entry))
      debugLog('Codex process detection', {
        rootPid,
        source,
        cached,
        rootExists,
        descendantCount: descendants.size,
        codexDetected,
      })
      return codexDetected
    }

    // tasklist fallback: no parent PID support.
    codexDetected = entries.some((entry) => isLikelyCodexProcess(entry))
    debugLog('Codex process detection', {
      rootPid,
      source,
      cached,
      rootExists,
      codexDetected,
      fallbackGlobalMatch: true,
    })
    return codexDetected
  }

  private codexMarkerPath(workspaceId: string, ptyPid: number): string {
    return join(ACTIVITY_DIR, `${workspaceId}${CODEX_MARKER_SEGMENT}${ptyPid}`)
  }

  private markCodexWorkspaceActive(workspaceId: string, ptyPid: number): void {
    const markerPath = this.codexMarkerPath(workspaceId, ptyPid)
    try {
      mkdirSync(ACTIVITY_DIR, { recursive: true })
      writeFileSync(markerPath, '')
      debugLog('Codex activity marker set', { workspaceId, ptyPid, markerPath })
    } catch (err) {
      debugLog('Codex activity marker write failed', { workspaceId, ptyPid, markerPath, error: err })
    }
  }

  private clearCodexWorkspaceActivity(workspaceId: string | undefined, ptyPid: number): void {
    if (!workspaceId) return
    const markerPath = this.codexMarkerPath(workspaceId, ptyPid)
    try {
      unlinkSync(markerPath)
      debugLog('Codex activity marker cleared', { workspaceId, ptyPid, markerPath })
    } catch (err) {
      const code = (err as NodeJS.ErrnoException | undefined)?.code
      if (code !== 'ENOENT') {
        debugLog('Codex activity marker clear failed', { workspaceId, ptyPid, markerPath, error: err })
      }
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
    } catch (err) {
      debugLog('PTY reattach redraw failed', { ptyId, pid: instance.process.pid, error: err })
    }
    return true
  }

  destroyAll(): void {
    for (const [id] of this.ptys) {
      this.destroy(id)
    }
  }
}
