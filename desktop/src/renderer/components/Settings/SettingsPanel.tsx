import { useEffect, useState } from 'react'
import { formatShortcut } from '@shared/platform'
import { SHORTCUT_MAP, type ShortcutBinding } from '@shared/shortcuts'
import { useAppStore } from '../../store/app-store'
import type { PromptTemplate, Settings } from '../../store/types'
import type { ThemePreference } from '@shared/ipc-channels'
import { Tooltip } from '../Tooltip/Tooltip'
import styles from './SettingsPanel.module.css'

const SHORTCUTS: Array<{ action: string; binding: ShortcutBinding }> = [
  { action: 'Quick open file', binding: SHORTCUT_MAP.quickOpenFile },
  { action: 'Command palette', binding: SHORTCUT_MAP.commandPalette },
  { action: 'New terminal', binding: SHORTCUT_MAP.newTerminal },
  { action: 'Close tab', binding: SHORTCUT_MAP.closeTab },
  { action: 'Close all tabs', binding: SHORTCUT_MAP.closeAllTabs },
  { action: 'Next tab', binding: SHORTCUT_MAP.nextTab },
  { action: 'Previous tab', binding: SHORTCUT_MAP.previousTab },
  { action: 'Tab 1–9', binding: SHORTCUT_MAP.tabOneToNine },
  { action: 'Next workspace', binding: SHORTCUT_MAP.nextWorkspace },
  { action: 'Previous workspace', binding: SHORTCUT_MAP.previousWorkspace },
  { action: 'New workspace', binding: SHORTCUT_MAP.newWorkspace },
  { action: 'Toggle sidebar', binding: SHORTCUT_MAP.toggleSidebar },
  { action: 'Toggle right panel', binding: SHORTCUT_MAP.toggleRightPanel },
  { action: 'Files panel', binding: SHORTCUT_MAP.filesPanel },
  { action: 'Changes panel', binding: SHORTCUT_MAP.changesPanel },
  { action: 'Memory panel', binding: SHORTCUT_MAP.memoryPanel },
  { action: 'Preview panel', binding: SHORTCUT_MAP.previewPanel },
  { action: 'Focus terminal', binding: SHORTCUT_MAP.focusTerminal },
  { action: 'Increase font size', binding: SHORTCUT_MAP.increaseFontSize },
  { action: 'Decrease font size', binding: SHORTCUT_MAP.decreaseFontSize },
  { action: 'Reset font size', binding: SHORTCUT_MAP.resetFontSize },
  { action: 'Settings', binding: SHORTCUT_MAP.settings },
]

function ToggleRow({ label, description, value, onChange }: {
  label: string
  description: string
  value: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className={styles.row} onClick={() => onChange(!value)}>
      <div className={styles.rowText}>
        <div className={styles.rowLabel}>{label}</div>
        <div className={styles.rowDescription}>{description}</div>
      </div>
      <button
        className={`${styles.toggle} ${value ? styles.toggleOn : ''}`}
        onClick={(e) => { e.stopPropagation(); onChange(!value) }}
      >
        <span className={styles.toggleKnob} />
      </button>
    </div>
  )
}

function TextRow({ label, description, value, onChange, placeholder }: {
  label: string
  description: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <div className={styles.row}>
      <div className={styles.rowText}>
        <div className={styles.rowLabel}>{label}</div>
        <div className={styles.rowDescription}>{description}</div>
      </div>
      <input
        className={styles.textInput}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  )
}

function SelectRow<T extends string>({
  label,
  description,
  value,
  onChange,
  options,
}: {
  label: string
  description: string
  value: T
  onChange: (v: T) => void
  options: Array<{ value: T; label: string }>
}) {
  return (
    <div className={styles.row}>
      <div className={styles.rowText}>
        <div className={styles.rowLabel}>{label}</div>
        <div className={styles.rowDescription}>{description}</div>
      </div>
      <select
        className={styles.selectInput}
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  )
}

function NumberRow({ label, description, value, onChange, min = 8, max = 32 }: {
  label: string
  description: string
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
}) {
  return (
    <div className={styles.row}>
      <div className={styles.rowText}>
        <div className={styles.rowLabel}>{label}</div>
        <div className={styles.rowDescription}>{description}</div>
      </div>
      <div className={styles.stepper}>
        <button
          className={styles.stepperBtn}
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
        >
          −
        </button>
        <span className={styles.stepperValue}>{value}</span>
        <button
          className={styles.stepperBtn}
          onClick={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
        >
          +
        </button>
      </div>
    </div>
  )
}

function TemplateEditorRow({
  template,
  onChange,
  onDelete,
}: {
  template: PromptTemplate
  onChange: (partial: Partial<PromptTemplate>) => void
  onDelete: () => void
}) {
  return (
    <div className={styles.templateCard}>
      <div className={styles.templateCardHeader}>
        <input
          className={styles.templateNameInput}
          value={template.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="Template name"
        />
        <button className={styles.templateDeleteBtn} onClick={onDelete}>Delete</button>
      </div>
      <textarea
        className={styles.templateContentInput}
        value={template.content}
        onChange={(e) => onChange({ content: e.target.value })}
        placeholder="Template text. Mentions: @workspace @branch @path @memory @file:README.md"
      />
    </div>
  )
}
function ClaudeHooksSection() {
  const [installed, setInstalled] = useState<boolean | null>(null)
  const [installing, setInstalling] = useState(false)

  useEffect(() => {
    window.api.claude.checkHooks().then((result: { installed: boolean }) => {
      setInstalled(result.installed)
    }).catch(() => setInstalled(false))
  }, [])

  const handleInstall = async () => {
    setInstalling(true)
    try {
      await window.api.claude.installHooks()
      setInstalled(true)
    } catch {
      setInstalled(false)
    } finally {
      setInstalling(false)
    }
  }

  const handleUninstall = async () => {
    setInstalling(true)
    try {
      await window.api.claude.uninstallHooks()
      setInstalled(false)
    } catch {
      // keep current state
    } finally {
      setInstalling(false)
    }
  }

  return (
    <div className={styles.row}>
      <div className={styles.rowText}>
        <div className={styles.rowLabel}>Claude Code hooks</div>
        <div className={styles.rowDescription}>
          Show an unread indicator when Claude Code finishes responding in a workspace
        </div>
      </div>
      {installed === true ? (
        <button
          className={styles.actionBtnDanger}
          onClick={handleUninstall}
          disabled={installing}
        >
          {installing ? 'Removing...' : 'Uninstall'}
        </button>
      ) : (
        <button
          className={styles.actionBtn}
          onClick={handleInstall}
          disabled={installing || installed === null}
        >
          {installing ? 'Installing...' : 'Install'}
        </button>
      )}
    </div>
  )
}

function CodexNotifySection() {
  const [installed, setInstalled] = useState<boolean | null>(null)
  const [installing, setInstalling] = useState(false)

  useEffect(() => {
    window.api.codex.checkNotify().then((result: { installed: boolean }) => {
      setInstalled(result.installed)
    }).catch(() => setInstalled(false))
  }, [])

  const handleInstall = async () => {
    setInstalling(true)
    try {
      await window.api.codex.installNotify()
      setInstalled(true)
    } catch {
      setInstalled(false)
    } finally {
      setInstalling(false)
    }
  }

  const handleUninstall = async () => {
    setInstalling(true)
    try {
      await window.api.codex.uninstallNotify()
      setInstalled(false)
    } catch {
      // keep current state
    } finally {
      setInstalling(false)
    }
  }

  return (
    <div className={styles.row}>
      <div className={styles.rowText}>
        <div className={styles.rowLabel}>Codex notify hook</div>
        <div className={styles.rowDescription}>
          Show done/unread state for Codex turns and clear active state when a turn completes
        </div>
      </div>
      {installed === true ? (
        <button
          className={styles.actionBtnDanger}
          onClick={handleUninstall}
          disabled={installing}
        >
          {installing ? 'Removing...' : 'Uninstall'}
        </button>
      ) : (
        <button
          className={styles.actionBtn}
          onClick={handleInstall}
          disabled={installing || installed === null}
        >
          {installing ? 'Installing...' : 'Install'}
        </button>
      )}
    </div>
  )
}

export function SettingsPanel() {
  const { settings, updateSettings, toggleSettings } = useAppStore()
  const themeOptions: Array<{ value: ThemePreference; label: string }> = [
    { value: 'system', label: 'Follow system' },
    { value: 'dark', label: 'Dark' },
    { value: 'light', label: 'Light' },
  ]

  const update = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    updateSettings({ [key]: value })
  }

  const updateTemplate = (id: string, partial: Partial<PromptTemplate>) => {
    update('promptTemplates', settings.promptTemplates.map((template) =>
      template.id === id ? { ...template, ...partial } : template
    ))
  }

  const addTemplate = () => {
    update('promptTemplates', [
      ...settings.promptTemplates,
      {
        id: crypto.randomUUID(),
        name: 'New template',
        content: '',
      },
    ])
  }

  const removeTemplate = (id: string) => {
    update('promptTemplates', settings.promptTemplates.filter((template) => template.id !== id))
  }

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') toggleSettings()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [toggleSettings])

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <div className={styles.headerInner}>
          <div className={styles.headerLeft}>
            <Tooltip
              label="Back"
              shortcut={formatShortcut(SHORTCUT_MAP.settings.mac, SHORTCUT_MAP.settings.win)}
            >
              <button aria-label="Back to workspace" className={styles.backBtn} onClick={toggleSettings}>‹</button>
            </Tooltip>
            <h2 className={styles.title}>Settings</h2>
          </div>
        </div>
      </div>

      <div className={styles.content}>
        <div className={styles.inner}>
          <div className={styles.section}>
            <div className={styles.sectionTitle}>Appearance</div>

            <SelectRow
              label="Theme"
              description="Follow Windows theme, or force dark/light mode"
              value={settings.themePreference}
              onChange={(v) => update('themePreference', v)}
              options={themeOptions}
            />

            <NumberRow
              label="Terminal font size"
              description="Font size in pixels for terminal tabs"
              value={settings.terminalFontSize}
              onChange={(v) => update('terminalFontSize', v)}
            />

            <ToggleRow
              label="Terminal copy on select"
              description="Automatically copy selected terminal text to clipboard"
              value={settings.terminalCopyOnSelect}
              onChange={(v) => update('terminalCopyOnSelect', v)}
            />

            <NumberRow
              label="Editor font size"
              description="Font size in pixels for file and diff editors"
              value={settings.editorFontSize}
              onChange={(v) => update('editorFontSize', v)}
            />
          </div>

          <div className={styles.section}>
            <div className={styles.sectionTitle}>General</div>

            <ToggleRow
              label="Confirm on close"
              description="Show confirmation when closing tabs with unsaved changes"
              value={settings.confirmOnClose}
              onChange={(v) => update('confirmOnClose', v)}
            />

            <ToggleRow
              label="Auto-save on blur"
              description="Automatically save files when switching away from a tab"
              value={settings.autoSaveOnBlur}
              onChange={(v) => update('autoSaveOnBlur', v)}
            />

            <ToggleRow
              label="Restore workspace"
              description="Restore the last active workspace when the app starts"
              value={settings.restoreWorkspace}
              onChange={(v) => update('restoreWorkspace', v)}
            />

            <ToggleRow
              label="Inline diffs"
              description="Show diffs inline instead of side-by-side"
              value={settings.diffInline}
              onChange={(v) => update('diffInline', v)}
            />

            <TextRow
              label="Default shell"
              description="Path to shell executable (leave empty for system default)"
              value={settings.defaultShell}
              onChange={(v) => update('defaultShell', v)}
              placeholder="e.g., pwsh.exe, powershell.exe, cmd.exe"
            />

            <TextRow
              label="Default shell args"
              description="Optional startup arguments for the default shell"
              value={settings.defaultShellArgs}
              onChange={(v) => update('defaultShellArgs', v)}
              placeholder='e.g., -NoLogo or /K "chcp 65001>nul"'
            />

          <div className={styles.row}>
            <div className={styles.rowText}>
              <div className={styles.rowLabel}>PR link provider</div>
              <div className={styles.rowDescription}>
                Set per project in Project Settings (gear icon in the sidebar).
              </div>
            </div>
          </div>
        </div>

          <div className={styles.section}>
            <div className={styles.sectionTitle}>Agent Integrations</div>
            <ClaudeHooksSection />
            <CodexNotifySection />
          </div>

          <div className={styles.section}>
            <div className={styles.sectionTitle}>Prompt templates</div>
            <div className={styles.templateHelp}>
              Reusable prompts for command palette and workspace memory. Mentions:
              <code>@workspace</code>, <code>@branch</code>, <code>@path</code>, <code>@memory</code>, <code>@file:&lt;relative-path&gt;</code>.
            </div>
            {settings.promptTemplates.map((template) => (
              <TemplateEditorRow
                key={template.id}
                template={template}
                onChange={(partial) => updateTemplate(template.id, partial)}
                onDelete={() => removeTemplate(template.id)}
              />
            ))}
            <button className={styles.templateAddBtn} onClick={addTemplate}>Add template</button>
          </div>

          <div className={styles.section}>
            <div className={styles.sectionTitle}>Keyboard Shortcuts</div>

            {SHORTCUTS.map((s) => (
              <div key={s.action} className={styles.shortcutRow}>
                <span className={styles.shortcutAction}>{s.action}</span>
                <kbd className={styles.kbd}>{formatShortcut(s.binding.mac, s.binding.win)}</kbd>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
