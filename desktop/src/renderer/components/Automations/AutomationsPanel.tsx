import { useState, useCallback, useEffect } from 'react'
import {
  Button,
  Card,
  CardHeader,
  Badge,
  Caption1,
  Switch,
  Input,
  Dropdown,
  Option,
  Textarea,
  Title3,
  Body1,
  Subtitle2,
  ToggleButton,
} from '@fluentui/react-components'
import {
  PlayRegular,
  DeleteRegular,
  AddRegular,
  ArrowLeftRegular,
} from '@fluentui/react-icons'
import { useAppStore } from '../../store/app-store'
import type { Automation } from '../../store/types'
import { Tooltip } from '../Tooltip/Tooltip'
import styles from './AutomationsPanel.module.css'

const SCHEDULE_PRESETS = [
  { label: 'Every hour', cron: '0 * * * *' },
  { label: 'Every 6 hours', cron: '0 */6 * * *' },
  { label: 'Daily at 9am', cron: '0 9 * * *' },
  { label: 'Weekly on Monday', cron: '0 9 * * 1' },
  { label: 'Custom', cron: '' },
]

function formatLastRun(timestamp?: number): string {
  if (!timestamp) return 'Never run'
  const diff = Date.now() - timestamp
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function statusBadge(status?: Automation['lastRunStatus']) {
  if (status === 'success') return <Badge appearance="filled" color="success" size="tiny" />
  if (status === 'failed' || status === 'timeout') return <Badge appearance="filled" color="danger" size="tiny" />
  return <Badge appearance="filled" color="subtle" size="tiny" />
}

// ── List View ──

function AutomationList({
  onNew,
  onEdit,
}: {
  onNew: () => void
  onEdit: (a: Automation) => void
}) {
  const {
    automations,
    projects,
    updateAutomation,
    removeAutomation,
    showConfirmDialog,
    dismissConfirmDialog,
    workspaces,
    deleteWorkspace,
  } = useAppStore()

  const handleToggleEnabled = useCallback(async (automation: Automation) => {
    const newEnabled = !automation.enabled
    updateAutomation(automation.id, { enabled: newEnabled })
    const project = projects.find((p) => p.id === automation.projectId)
    if (!project) return
    if (newEnabled) {
      await window.api.automations.create({ ...automation, enabled: true, repoPath: project.repoPath })
    } else {
      await window.api.automations.delete(automation.id)
    }
  }, [projects, updateAutomation])

  const handleRunNow = useCallback(async (automation: Automation) => {
    const project = projects.find((p) => p.id === automation.projectId)
    if (!project) return
    await window.api.automations.runNow({ ...automation, repoPath: project.repoPath })
  }, [projects])

  const handleDelete = useCallback((automation: Automation) => {
    showConfirmDialog({
      title: 'Delete Automation',
      message: `Delete automation "${automation.name}"? This will remove it and all its run workspaces.`,
      confirmLabel: 'Delete',
      destructive: true,
      onConfirm: () => {
        const runWs = workspaces.filter((w) => w.automationId === automation.id)
        for (const ws of runWs) deleteWorkspace(ws.id)
        window.api.automations.delete(automation.id)
        removeAutomation(automation.id)
        dismissConfirmDialog()
      },
    })
  }, [showConfirmDialog, dismissConfirmDialog, workspaces, deleteWorkspace, removeAutomation])

  if (automations.length === 0) {
    return (
      <div className={styles.emptyState}>
        <Body1 className={styles.emptyText}>No automations yet</Body1>
        <Button appearance="outline" icon={<AddRegular />} onClick={onNew}>
          Create your first automation
        </Button>
      </div>
    )
  }

  return (
    <div className={styles.list}>
      {automations.map((automation) => {
        const project = projects.find((p) => p.id === automation.projectId)
        return (
          <Card
            key={automation.id}
            size="small"
            className={automation.enabled ? undefined : styles.cardDisabled}
            style={{ cursor: 'pointer' }}
            onClick={() => onEdit(automation)}
          >
            <CardHeader
              image={statusBadge(automation.lastRunStatus)}
              header={<Subtitle2>{automation.name}</Subtitle2>}
              description={
                <Caption1 className={styles.description}>
                  {project?.name ?? 'Unknown project'} &middot; {automation.cronExpression} &middot; {formatLastRun(automation.lastRunAt)}
                </Caption1>
              }
              action={
                <div
                  className={styles.cardActions}
                  onClick={(e) => e.stopPropagation()}
                >
                  <Tooltip label="Run now">
                    <Button
                      appearance="subtle"
                      icon={<PlayRegular />}
                      size="small"
                      onClick={() => handleRunNow(automation)}
                    />
                  </Tooltip>
                  <Tooltip label={automation.enabled ? 'Disable' : 'Enable'}>
                    <Switch
                      checked={automation.enabled}
                      onChange={() => handleToggleEnabled(automation)}
                    />
                  </Tooltip>
                  <Tooltip label="Delete">
                    <Button
                      appearance="subtle"
                      icon={<DeleteRegular />}
                      size="small"
                      onClick={() => handleDelete(automation)}
                    />
                  </Tooltip>
                </div>
              }
            />
          </Card>
        )
      })}
    </div>
  )
}

// ── Form View ──

function AutomationForm({
  editingAutomation,
  onBack,
}: {
  editingAutomation: Automation | null
  onBack: () => void
}) {
  const { projects, addAutomation, updateAutomation } = useAppStore()
  const isEditing = !!editingAutomation

  const [projectId, setProjectId] = useState(editingAutomation?.projectId || projects[0]?.id || '')
  const [prompt, setPrompt] = useState(editingAutomation?.prompt || '')
  const [name, setName] = useState(editingAutomation?.name || '')
  const [nameManuallySet, setNameManuallySet] = useState(isEditing)
  const [selectedPreset, setSelectedPreset] = useState(() => {
    if (!editingAutomation) return 0
    const idx = SCHEDULE_PRESETS.findIndex((p) => p.cron === editingAutomation.cronExpression)
    return idx >= 0 ? idx : SCHEDULE_PRESETS.length - 1
  })
  const [customCron, setCustomCron] = useState(
    editingAutomation ? editingAutomation.cronExpression : ''
  )
  useEffect(() => {
    if (!nameManuallySet && prompt) {
      setName(prompt.slice(0, 40))
    }
  }, [prompt, nameManuallySet])

  const cronExpression = selectedPreset === SCHEDULE_PRESETS.length - 1
    ? customCron
    : SCHEDULE_PRESETS[selectedPreset].cron

  const isValid = projectId && prompt.trim() && name.trim() && cronExpression

  const handleSubmit = useCallback(async () => {
    if (!isValid) return
    const project = projects.find((p) => p.id === projectId)
    if (!project) return

    if (isEditing && editingAutomation) {
      updateAutomation(editingAutomation.id, {
        name: name.trim(),
        projectId,
        prompt: prompt.trim(),
        cronExpression,
      })
      await window.api.automations.update({
        ...editingAutomation,
        name: name.trim(),
        projectId,
        prompt: prompt.trim(),
        cronExpression,
        repoPath: project.repoPath,
      })
    } else {
      const automation: Automation = {
        id: crypto.randomUUID(),
        name: name.trim(),
        projectId,
        prompt: prompt.trim(),
        cronExpression,
        enabled: true,
        createdAt: Date.now(),
      }
      addAutomation(automation)
      await window.api.automations.create({
        ...automation,
        repoPath: project.repoPath,
      })
    }

    onBack()
  }, [isValid, projectId, prompt, name, cronExpression, isEditing, editingAutomation, projects, addAutomation, updateAutomation, onBack])

  const selectedProject = projects.find((p) => p.id === projectId)

  return (
    <>
      <Button
        appearance="subtle"
        icon={<ArrowLeftRegular />}
        onClick={onBack}
        className={styles.backBtn}
      >
        Back
      </Button>
      <Title3 className={styles.formTitle}>{isEditing ? 'Edit Automation' : 'New Automation'}</Title3>

      <div className={styles.form}>
        <div className={styles.fieldGroup}>
          <Caption1 className={styles.fieldLabel}>Name</Caption1>
          <Input
            value={name}
            onChange={(_e, data) => { setName(data.value); setNameManuallySet(true) }}
            placeholder="Automation name"
            autoFocus
          />
        </div>

        <div className={styles.fieldGroup}>
          <Caption1 className={styles.fieldLabel}>Project</Caption1>
          <Dropdown
            value={selectedProject?.name ?? ''}
            selectedOptions={[projectId]}
            onOptionSelect={(_e, data) => { if (data.optionValue) setProjectId(data.optionValue) }}
          >
            {projects.map((p) => (
              <Option key={p.id} value={p.id}>{p.name}</Option>
            ))}
          </Dropdown>
        </div>

        <div className={styles.fieldGroup}>
          <Caption1 className={styles.fieldLabel}>Prompt</Caption1>
          <Textarea
            value={prompt}
            onChange={(_e, data) => setPrompt(data.value)}
            placeholder="Review the codebase for security issues..."
            rows={3}
            resize="vertical"
          />
        </div>

        <div className={styles.fieldGroup}>
          <Caption1 className={styles.fieldLabel}>Schedule</Caption1>
          <div className={styles.presetRow}>
            {SCHEDULE_PRESETS.map((preset, i) => (
              <ToggleButton
                key={preset.label}
                size="small"
                checked={selectedPreset === i}
                onClick={() => setSelectedPreset(i)}
              >
                {preset.label}
              </ToggleButton>
            ))}
          </div>
          <Input
            value={selectedPreset === SCHEDULE_PRESETS.length - 1 ? customCron : SCHEDULE_PRESETS[selectedPreset].cron}
            onChange={(_e, data) => { setCustomCron(data.value); setSelectedPreset(SCHEDULE_PRESETS.length - 1) }}
            placeholder="*/5 * * * *"
            className={styles.cronInput}
          />
        </div>

        <div className={styles.formActions}>
          <Button appearance="secondary" onClick={onBack}>Cancel</Button>
          <Button appearance="primary" onClick={handleSubmit} disabled={!isValid}>
            {isEditing ? 'Save' : 'Create'}
          </Button>
        </div>
      </div>
    </>
  )
}

// ── Panel ──

export function AutomationsPanel() {
  const { toggleAutomations } = useAppStore()
  const [view, setView] = useState<'list' | 'form'>('list')
  const [editingAutomation, setEditingAutomation] = useState<Automation | null>(null)

  const handleNew = useCallback(() => {
    setEditingAutomation(null)
    setView('form')
  }, [])

  const handleEdit = useCallback((automation: Automation) => {
    setEditingAutomation(automation)
    setView('form')
  }, [])

  const handleBack = useCallback(() => {
    setEditingAutomation(null)
    setView('list')
  }, [])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (view === 'form') {
          handleBack()
        } else {
          toggleAutomations()
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [view, handleBack, toggleAutomations])

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <div className={styles.headerInner}>
          <div className={styles.headerLeft}>
            <Tooltip label="Back">
              <Button appearance="subtle" icon={<ArrowLeftRegular />} onClick={toggleAutomations} />
            </Tooltip>
            <Title3>Automations</Title3>
          </div>
          {view === 'list' && (
            <Button appearance="outline" icon={<AddRegular />} size="small" onClick={handleNew}>
              New
            </Button>
          )}
        </div>
      </div>

      <div className={styles.content}>
        <div className={styles.inner}>
          {view === 'list' ? (
            <AutomationList onNew={handleNew} onEdit={handleEdit} />
          ) : (
            <AutomationForm editingAutomation={editingAutomation} onBack={handleBack} />
          )}
        </div>
      </div>
    </div>
  )
}
