import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { resolve } from 'path'

const appPath = resolve(__dirname, '../out/main/index.js')

async function launchApp(): Promise<{ app: ElectronApplication; window: Page }> {
  const app = await electron.launch({ args: [appPath], env: { ...process.env } })
  const window = await app.firstWindow()
  await window.waitForLoadState('domcontentloaded')
  await window.waitForSelector('#root', { timeout: 30000 })
  await window.waitForTimeout(2000)
  return { app, window }
}

async function setupTerminal(window: Page, workingDir: string): Promise<{ ptyId: string; token: string }> {
  return await window.evaluate(async (worktreePath: string) => {
    const store = (window as any).__store.getState()
    store.hydrateState({ projects: [], workspaces: [], tabs: [] })

    const projectId = crypto.randomUUID()
    const workspaceId = crypto.randomUUID()
    const token = `SMOKE_INPUT_${Date.now()}`

    store.addProject({ id: projectId, name: 'smoke', repoPath: worktreePath })
    store.addWorkspace({
      id: workspaceId,
      projectId,
      name: 'smoke-ws',
      type: 'feature',
      branch: 'smoke',
      worktreePath,
      agentPermissionMode: 'full-permissions',
    })

    const ptyId = await (window as any).api.pty.create(worktreePath, undefined, undefined, {
      AGENT_ORCH_WS_ID: workspaceId,
      AGENT_ORCH_PERMISSION_MODE: 'full-permissions',
    })
    store.addTab({
      id: crypto.randomUUID(),
      workspaceId,
      type: 'terminal',
      title: 'Terminal',
      ptyId,
    })

    const w = window as any
    w.__smokeWrites = []
    if (!w.__smokeWriteWrapped) {
      const originalWrite = w.api.pty.write.bind(w.api.pty)
      w.__smokeOriginalWrite = originalWrite
      w.api.pty.write = (targetPtyId: string, data: string) => {
        w.__smokeWrites.push({ ptyId: targetPtyId, data })
        return originalWrite(targetPtyId, data)
      }
      w.__smokeWriteWrapped = true
    }

    ;(window as any).__smoke = { ptyId, token, chunks: [] as string[] }
    ;(window as any).__smoke.unsub = (window as any).api.pty.onData(ptyId, (data: string) => {
      ;(window as any).__smoke.chunks.push(data)
    })

    return { ptyId, token }
  }, workingDir)
}

test.describe('Terminal input smoke', () => {
  test('accepts keyboard input on first terminal', async () => {
    const { app, window } = await launchApp()

    try {
      const { ptyId, token } = await setupTerminal(window, process.cwd())
      expect(ptyId).toMatch(/^pty-/)

      const terminalInner = window.locator('[class*="terminalInner"]').first()
      await expect(terminalInner).toBeVisible({ timeout: 20000 })
      await terminalInner.click({ position: { x: 80, y: 80 } })

      const helperTextarea = window.locator('.xterm-helper-textarea').first()
      await expect(helperTextarea).toBeVisible({ timeout: 10000 })
      await helperTextarea.focus()

      await window.keyboard.type(`echo ${token}`)
      await window.keyboard.press('Enter')

      await expect
        .poll(
          async () =>
            await window.evaluate((needle: string) => {
              const chunks = ((window as any).__smoke?.chunks ?? []) as string[]
              return chunks.join('').includes(needle)
            }, token),
          { timeout: 15000, intervals: [250, 500, 1000] },
        )
        .toBe(true)
    } finally {
      await window.evaluate(() => {
        const w = window as any
        const smoke = w.__smoke
        try {
          smoke?.unsub?.()
        } catch {}
        if (smoke?.ptyId) {
          w.api.pty.destroy(smoke.ptyId)
        }
        if (w.__smokeWriteWrapped && w.__smokeOriginalWrite) {
          try {
            w.api.pty.write = w.__smokeOriginalWrite
            w.__smokeWriteWrapped = false
          } catch {}
        }
      })
      await app.close()
    }
  })

  test('Ctrl+Enter sends multiline key sequence to terminal PTY', async () => {
    const { app, window } = await launchApp()

    try {
      const { ptyId } = await setupTerminal(window, process.cwd())
      const terminalInner = window.locator('[class*="terminalInner"]').first()
      await expect(terminalInner).toBeVisible({ timeout: 20000 })
      await terminalInner.click({ position: { x: 80, y: 80 } })

      const helperTextarea = window.locator('.xterm-helper-textarea').first()
      await expect(helperTextarea).toBeVisible({ timeout: 10000 })
      await helperTextarea.focus()

      await window.evaluate(() => {
        ;(window as any).__smokeWrites = []
      })

      await window.keyboard.press('Control+Enter')

      await expect
        .poll(
          async () =>
            await window.evaluate((expectedPtyId: string) => {
              const writes = ((window as any).__smokeWrites ?? []) as Array<{ ptyId: string; data: string }>
              return writes.some((entry) => entry.ptyId === expectedPtyId && entry.data === '\x1b[13;5u')
            }, ptyId),
          { timeout: 5000, intervals: [150, 300, 600] },
        )
        .toBe(true)
    } finally {
      await window.evaluate(() => {
        const w = window as any
        try {
          w.__smoke?.unsub?.()
        } catch {}
        if (w.__smoke?.ptyId) {
          w.api.pty.destroy(w.__smoke.ptyId)
        }
        if (w.__smokeWriteWrapped && w.__smokeOriginalWrite) {
          try {
            w.api.pty.write = w.__smokeOriginalWrite
            w.__smokeWriteWrapped = false
          } catch {}
        }
      })
      await app.close()
    }
  })
})
