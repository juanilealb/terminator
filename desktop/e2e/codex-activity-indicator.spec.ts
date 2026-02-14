import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test'
import { resolve, join } from 'path'
import { mkdirSync, rmSync, writeFileSync } from 'fs'
import { execSync } from 'child_process'
import { tmpdir } from 'os'

const appPath = resolve(__dirname, '../out/main/index.js')
const FAKE_CODEX_BIN = join(tmpdir(), 'codex.exe')
const TEST_TERMINAL = 'pwsh.exe'
const NOTIFY_DIR = join(tmpdir(), 'terminator-notify')
const ACTIVITY_DIR = join(tmpdir(), 'terminator-activity')

function psQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

function spawnFakeCodexCommand(fakeCodexPath: string): string {
  return [
    `$timeoutBin = (Get-Command timeout.exe).Source`,
    `$target = ${psQuote(fakeCodexPath)}`,
    'Copy-Item -Path $timeoutBin -Destination $target -Force',
    '& $target /T 2 /NOBREAK',
    '',
  ].join('; ')
}

function notifyAndClearCodexCommand(workspaceId: string): string {
  const activityPattern = join(ACTIVITY_DIR, `${workspaceId}.codex.*`)
  return [
    `$notifyDir = ${psQuote(NOTIFY_DIR)}`,
    'New-Item -ItemType Directory -Path $notifyDir -Force | Out-Null',
    '$notifyFile = Join-Path $notifyDir ("test-" + [guid]::NewGuid().ToString())',
    `Set-Content -Path $notifyFile -Value ${psQuote(workspaceId)} -NoNewline`,
    `Remove-Item -Path ${psQuote(activityPattern)} -Force -ErrorAction SilentlyContinue`,
    '',
  ].join('; ') + '\n'
}

function clearCodexActivityCommand(workspaceId: string): string {
  const activityPattern = join(ACTIVITY_DIR, `${workspaceId}.codex.*`)
  return `Remove-Item -Path ${psQuote(activityPattern)} -Force -ErrorAction SilentlyContinue\n`
}

function markCodexActivityCommand(workspaceId: string): string {
  return [
    `$activityDir = ${psQuote(ACTIVITY_DIR)}`,
    'New-Item -ItemType Directory -Path $activityDir -Force | Out-Null',
    `$workspaceId = ${psQuote(workspaceId)}`,
    '$markerPath = Join-Path $activityDir ("$workspaceId.codex.$PID")',
    'New-Item -ItemType File -Path $markerPath -Force | Out-Null',
    '',
  ].join('; ') + '\n'
}

function codexQuestionPromptCommand(): string {
  return [
    'Write-Output "Question 1/1 (1 unanswered)"',
    'Write-Output "How should project-level provider interact with the existing global setting?"',
    'Write-Output "tab to add notes | enter to submit answer | esc to interrupt"',
    'Start-Sleep -Seconds 20',
    '',
  ].join('; ') + '\n'
}

function markClaudeActivityCommand(workspaceId: string): string {
  const markerPath = join(ACTIVITY_DIR, `${workspaceId}.claude`)
  return [
    `$activityDir = ${psQuote(ACTIVITY_DIR)}`,
    'New-Item -ItemType Directory -Path $activityDir -Force | Out-Null',
    `New-Item -ItemType File -Path ${psQuote(markerPath)} -Force | Out-Null`,
    '',
  ].join('; ') + '\n'
}

function clearClaudeActivityCommand(workspaceId: string): string {
  const markerPath = join(ACTIVITY_DIR, `${workspaceId}.claude`)
  return `Remove-Item -Path ${psQuote(markerPath)} -Force -ErrorAction SilentlyContinue\n`
}

async function launchApp(): Promise<{ app: ElectronApplication; window: Page }> {
  const app = await electron.launch({ args: [appPath], env: { ...process.env, CI_TEST: '1' } })
  const window = await app.firstWindow()
  await window.waitForLoadState('domcontentloaded')
  await window.waitForSelector('#root', { timeout: 10000 })
  await window.waitForTimeout(1500)
  return { app, window }
}

function createTestRepo(name: string): string {
  const stamp = `${name}-${Date.now()}`
  const repoPath = join(tmpdir(), `test-repo-${stamp}`)
  const remotePath = join(tmpdir(), `test-remote-${stamp}.git`)
  mkdirSync(repoPath, { recursive: true })
  execSync('git init', { cwd: repoPath })
  execSync('git checkout -b main', { cwd: repoPath })
  writeFileSync(join(repoPath, 'README.md'), '# Test Repo\n')
  execSync('git add .', { cwd: repoPath })
  execSync('git commit -m "initial commit"', { cwd: repoPath })
  execSync(`git init --bare "${remotePath}"`)
  execSync(`git remote add origin "${remotePath}"`, { cwd: repoPath })
  return repoPath
}

async function setupWorkspace(window: Page, repoPath: string) {
  return await window.evaluate(async ({ repo, shell }: { repo: string; shell: string }) => {
    const store = (window as any).__store.getState()
    store.hydrateState({ projects: [], workspaces: [] })

    const projectId = crypto.randomUUID()
    store.addProject({ id: projectId, name: 'test-repo', repoPath: repo })

    const worktreePath = await (window as any).api.git.createWorktree(repo, 'ws-codex', 'branch-codex', true, 'main')
    const workspaceId = crypto.randomUUID()
    store.addWorkspace({
      id: workspaceId,
      name: 'ws-codex',
      branch: 'branch-codex',
      worktreePath,
      projectId,
    })

    const ptyId = await (window as any).api.pty.create(worktreePath, shell, { AGENT_ORCH_WS_ID: workspaceId })
    store.addTab({
      id: crypto.randomUUID(),
      workspaceId,
      type: 'terminal',
      title: 'Terminal',
      ptyId,
    })

    return { workspaceId, ptyId }
  }, { repo: repoPath, shell: TEST_TERMINAL })
}

async function setupTwoWorkspaces(window: Page, repoPath: string) {
  return await window.evaluate(async ({ repo, shell }: { repo: string; shell: string }) => {
    const store = (window as any).__store.getState()
    store.hydrateState({ projects: [], workspaces: [] })

    const projectId = crypto.randomUUID()
    store.addProject({ id: projectId, name: 'test-repo', repoPath: repo })

    const worktreePath1 = await (window as any).api.git.createWorktree(repo, 'ws-codex-a', 'branch-codex-a', true, 'main')
    const workspaceId1 = crypto.randomUUID()
    store.addWorkspace({
      id: workspaceId1,
      name: 'ws-codex-a',
      branch: 'branch-codex-a',
      worktreePath: worktreePath1,
      projectId,
    })
    const ptyId1 = await (window as any).api.pty.create(worktreePath1, shell, { AGENT_ORCH_WS_ID: workspaceId1 })
    store.addTab({
      id: crypto.randomUUID(),
      workspaceId: workspaceId1,
      type: 'terminal',
      title: 'Terminal',
      ptyId: ptyId1,
    })

    const worktreePath2 = await (window as any).api.git.createWorktree(repo, 'ws-codex-b', 'branch-codex-b', true, 'main')
    const workspaceId2 = crypto.randomUUID()
    store.addWorkspace({
      id: workspaceId2,
      name: 'ws-codex-b',
      branch: 'branch-codex-b',
      worktreePath: worktreePath2,
      projectId,
    })
    const ptyId2 = await (window as any).api.pty.create(worktreePath2, shell, { AGENT_ORCH_WS_ID: workspaceId2 })
    store.addTab({
      id: crypto.randomUUID(),
      workspaceId: workspaceId2,
      type: 'terminal',
      title: 'Terminal',
      ptyId: ptyId2,
    })

    // Keep ws-b selected while ws-a runs in background.
    store.setActiveWorkspace(workspaceId2)

    return { workspaceId1, workspaceId2, ptyId1, ptyId2 }
  }, { repo: repoPath, shell: TEST_TERMINAL })
}

test.describe('Codex activity indicator', () => {
  test('marks workspace active while codex process runs and clears when done', async () => {
    const repoPath = createTestRepo('codex-activity')
    const { app, window } = await launchApp()

    try {
      const { workspaceId, ptyId } = await setupWorkspace(window, repoPath)
      await window.waitForTimeout(800)

      await window.evaluate(({ ptyId: id, fakeCodexPath }) => {
        ;(window as any).api.pty.write(
          id,
          fakeCodexPath
        )
      }, { ptyId, fakeCodexPath: spawnFakeCodexCommand(FAKE_CODEX_BIN) })

      await window.waitForTimeout(300)
      await window.evaluate((id: string) => {
        ;(window as any).api.pty.write(id, '\n')
      }, ptyId)

      await window.waitForFunction(
        (wsId: string) => (window as any).__store.getState().activeClaudeWorkspaceIds.has(wsId),
        workspaceId,
        { timeout: 5000 }
      )

      await window.waitForTimeout(2200)
      await window.evaluate(({ ptyId: id, cmd }) => {
        ;(window as any).api.pty.write(id, cmd)
      }, { ptyId, cmd: notifyAndClearCodexCommand(workspaceId) })

      await window.waitForFunction(
        (wsId: string) => !(window as any).__store.getState().activeClaudeWorkspaceIds.has(wsId),
        workspaceId,
        { timeout: 10000 }
      )

      const isActive = await window.evaluate((wsId: string) => {
        return (window as any).__store.getState().activeClaudeWorkspaceIds.has(wsId)
      }, workspaceId)
      expect(isActive).toBe(false)
    } finally {
      rmSync(FAKE_CODEX_BIN, { force: true })
      await app.close()
    }
  })

  test('marks background workspace unread when activity transitions to done', async () => {
    const repoPath = createTestRepo('codex-unread')
    const { app, window } = await launchApp()

    try {
      const { workspaceId1, workspaceId2, ptyId1 } = await setupTwoWorkspaces(window, repoPath)
      await window.waitForTimeout(800)

      await window.evaluate(({ ptyId: id, fakeCodexPath }) => {
        ;(window as any).api.pty.write(
          id,
          fakeCodexPath
        )
      }, { ptyId: ptyId1, fakeCodexPath: spawnFakeCodexCommand(FAKE_CODEX_BIN) })

      await window.waitForTimeout(300)
      await window.evaluate((id: string) => {
        ;(window as any).api.pty.write(id, '\n')
      }, ptyId1)

      await window.waitForFunction(
        (wsId: string) => (window as any).__store.getState().activeClaudeWorkspaceIds.has(wsId),
        workspaceId1,
        { timeout: 5000 }
      )

      // Ensure ws-b is still selected while ws-a finishes.
      await window.evaluate((wsId: string) => {
        ;(window as any).__store.getState().setActiveWorkspace(wsId)
      }, workspaceId2)

      await window.waitForTimeout(2200)
      await window.evaluate(({ ptyId: id, cmd }) => {
        ;(window as any).api.pty.write(id, cmd)
      }, { ptyId: ptyId1, cmd: clearCodexActivityCommand(workspaceId1) })

      await window.waitForFunction(
        (wsId: string) => !(window as any).__store.getState().activeClaudeWorkspaceIds.has(wsId),
        workspaceId1,
        { timeout: 10000 }
      )

      await window.waitForFunction(
        (wsId: string) => (window as any).__store.getState().unreadWorkspaceIds.has(wsId),
        workspaceId1,
        { timeout: 5000 }
      )

      const hasUnread = await window.evaluate((wsId: string) => {
        return (window as any).__store.getState().unreadWorkspaceIds.has(wsId)
      }, workspaceId1)
      expect(hasUnread).toBe(true)
    } finally {
      rmSync(FAKE_CODEX_BIN, { force: true })
      await app.close()
    }
  })

  test('keeps Claude activity marker when another terminal in same workspace closes', async () => {
    const repoPath = createTestRepo('claude-activity-multi-tab')
    const { app, window } = await launchApp()

    try {
      const { workspaceId, ptyId: primaryPtyId } = await setupWorkspace(window, repoPath)
      await window.waitForTimeout(800)

      const secondaryPtyId = await window.evaluate(async ({ wsId, shell }: { wsId: string; shell: string }) => {
        const state = (window as any).__store.getState()
        const workspace = state.workspaces.find((w: { id: string; worktreePath: string }) => w.id === wsId)
        if (!workspace) throw new Error('workspace not found')

        const ptyId = await (window as any).api.pty.create(workspace.worktreePath, shell, { AGENT_ORCH_WS_ID: wsId })
        state.addTab({
          id: crypto.randomUUID(),
          workspaceId: wsId,
          type: 'terminal',
          title: 'Terminal extra',
          ptyId,
        })
        return ptyId
      }, { wsId: workspaceId, shell: TEST_TERMINAL })

      // Simulate Claude UserPromptSubmit hook writing its activity marker.
      await window.evaluate(({ ptyId: id, cmd }) => {
        ;(window as any).api.pty.write(id, cmd)
      }, { ptyId: primaryPtyId, cmd: markClaudeActivityCommand(workspaceId) })

      await window.waitForFunction(
        (wsId: string) => (window as any).__store.getState().activeClaudeWorkspaceIds.has(wsId),
        workspaceId,
        { timeout: 5000 }
      )

      // Closing a different terminal in the same workspace should not clear Claude activity.
      await window.evaluate((ptyId: string) => {
        ;(window as any).api.pty.destroy(ptyId)
      }, secondaryPtyId)
      await window.waitForTimeout(1200)

      const isStillActive = await window.evaluate((wsId: string) => {
        return (window as any).__store.getState().activeClaudeWorkspaceIds.has(wsId)
      }, workspaceId)
      expect(isStillActive).toBe(true)

      // Cleanup marker created by this test.
      await window.evaluate(({ ptyId: id, cmd }) => {
        ;(window as any).api.pty.write(id, cmd)
      }, { ptyId: primaryPtyId, cmd: clearClaudeActivityCommand(workspaceId) })
    } finally {
      rmSync(FAKE_CODEX_BIN, { force: true })
      await app.close()
    }
  })

  test('shows unread when Codex asks a question before process exit', async () => {
    const repoPath = createTestRepo('codex-question-unread')
    const { app, window } = await launchApp()

    try {
      const { workspaceId1, workspaceId2, ptyId1 } = await setupTwoWorkspaces(window, repoPath)
      await window.waitForTimeout(800)

      await window.evaluate(({ ptyId: id, cmd }) => {
        ;(window as any).api.pty.write(id, cmd)
      }, { ptyId: ptyId1, cmd: markCodexActivityCommand(workspaceId1) })

      await window.waitForFunction(
        (wsId: string) => (window as any).__store.getState().activeClaudeWorkspaceIds.has(wsId),
        workspaceId1,
        { timeout: 8000 }
      )

      await window.evaluate(({ ptyId: id, cmd }) => {
        ;(window as any).api.pty.write(id, cmd)
      }, { ptyId: ptyId1, cmd: codexQuestionPromptCommand() })

      // Keep ws-b selected while ws-a asks a question in the background.
      await window.evaluate((wsId: string) => {
        ;(window as any).__store.getState().setActiveWorkspace(wsId)
      }, workspaceId2)

      // The question prompt should stop activity and mark unread before process exit.
      await window.waitForFunction(
        (wsId: string) => !(window as any).__store.getState().activeClaudeWorkspaceIds.has(wsId),
        workspaceId1,
        { timeout: 7000 }
      )
      await window.waitForFunction(
        (wsId: string) => (window as any).__store.getState().unreadWorkspaceIds.has(wsId),
        workspaceId1,
        { timeout: 7000 }
      )
    } finally {
      rmSync(FAKE_CODEX_BIN, { force: true })
      await app.close()
    }
  })
})
