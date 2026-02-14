import * as cron from 'node-cron'
import { BrowserWindow } from 'electron'
import { IPC } from '../shared/ipc-channels'
import { PtyManager } from './pty-manager'
import { GitService } from './git-service'
import { trustPathForClaude } from './claude-config'
import { basenameSafe, resolveDefaultShellProfile } from '@shared/platform'

export interface AutomationConfig {
  id: string
  name: string
  projectId: string
  prompt: string
  cronExpression: string
  enabled: boolean
  repoPath: string
}

function buildClaudePromptCommand(shell: string, prompt: string): string {
  const shellName = basenameSafe(shell.toLowerCase())

  if (shellName === 'pwsh.exe' || shellName === 'powershell.exe' || shellName === 'pwsh' || shellName === 'powershell') {
    const escaped = prompt.replace(/'/g, "''")
    return `claude '${escaped}'\r`
  }

  if (shellName === 'cmd.exe' || shellName === 'cmd') {
    const escaped = prompt
      .replace(/\^/g, '^^')
      .replace(/%/g, '%%')
      .replace(/"/g, '""')
      .replace(/[&|<>]/g, (ch) => `^${ch}`)
    return `claude "${escaped}"\r`
  }

  const escaped = prompt.replace(/"/g, '\\"')
  return `claude "${escaped}"\r`
}

export class AutomationScheduler {
  private jobs = new Map<string, cron.ScheduledTask>()
  private ptyManager: PtyManager

  constructor(ptyManager: PtyManager) {
    this.ptyManager = ptyManager
  }

  schedule(config: AutomationConfig): void {
    this.unschedule(config.id)
    if (!config.enabled) return

    const task = cron.schedule(config.cronExpression, () => {
      this.executeRun(config).catch((err) => {
        console.error(`Automation ${config.id} run failed:`, err)
      })
    })

    this.jobs.set(config.id, task)
  }

  unschedule(automationId: string): void {
    const job = this.jobs.get(automationId)
    if (job) {
      job.stop()
      this.jobs.delete(automationId)
    }
  }

  runNow(config: AutomationConfig): void {
    this.executeRun(config).catch((err) => {
      console.error(`Automation ${config.id} run failed:`, err)
    })
  }

  destroyAll(): void {
    for (const [id] of this.jobs) {
      this.unschedule(id)
    }
  }

  private async executeRun(config: AutomationConfig): Promise<void> {
    const win = BrowserWindow.getAllWindows()[0]
    if (!win) return

    const sanitized = config.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 30)
    const safeName = sanitized || 'run'
    const now = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`

    const branch = `auto/${safeName}/${timestamp}`
    const wtName = `auto-${safeName}-${timestamp}`

    let worktreePath: string
    try {
      worktreePath = await GitService.createWorktree(config.repoPath, wtName, branch, true)
    } catch (err) {
      console.error(`Failed to create worktree for automation ${config.id}:`, err)
      return
    }

    try {
      await trustPathForClaude(worktreePath)
    } catch {
      // non-fatal
    }

    // Spawn a shell with initialWrite — writes the claude command as soon as
    // the shell emits its first output (ready), no manual timeout needed.
    const shellProfile = resolveDefaultShellProfile()
    const shell = shellProfile.shell
    const command = buildClaudePromptCommand(shell, config.prompt)
    const ptyId = this.ptyManager.create(
      worktreePath,
      win.webContents,
      shell,
      shellProfile.args,
      undefined,
      command,
    )

    // Notify renderer to create workspace + terminal tab
    if (!win.isDestroyed()) {
      win.webContents.send(IPC.AUTOMATION_RUN_STARTED, {
        automationId: config.id,
        automationName: config.name,
        projectId: config.projectId,
        ptyId,
        worktreePath,
        branch,
      })
    }
  }
}
