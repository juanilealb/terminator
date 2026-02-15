import { useEffect, useState, useCallback } from 'react'
import {
  Tree,
  TreeItem,
  TreeItemLayout,
  type TreeOpenChangeData,
  type TreeOpenChangeEvent,
} from '@fluentui/react-components'
import {
  FolderRegular,
  FolderOpenRegular,
  DocumentRegular,
} from '@fluentui/react-icons'
import { basenameSafe, toPosixPath } from '@shared/platform'
import { useAppStore } from '../../store/app-store'
import styles from './RightPanel.module.css'

interface FileNode {
  name: string
  path: string
  type: 'file' | 'directory'
  children?: FileNode[]
  gitStatus?: 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked'
}

interface Props {
  worktreePath: string
  isActive?: boolean
}

const GIT_STATUS_CLASS: Record<string, string> = {
  modified: styles.gitModified,
  added: styles.gitAdded,
  deleted: styles.gitDeleted,
  renamed: styles.gitRenamed,
  untracked: styles.gitUntracked,
}

function collectDescendantPaths(node: FileNode): string[] {
  const paths: string[] = [node.path]
  if (node.children) {
    for (const child of node.children) {
      if (child.type === 'directory') {
        paths.push(...collectDescendantPaths(child))
      }
    }
  }
  return paths
}

function findNode(nodes: FileNode[], path: string): FileNode | undefined {
  for (const node of nodes) {
    if (node.path === path) return node
    if (node.children) {
      const found = findNode(node.children, path)
      if (found) return found
    }
  }
  return undefined
}

function renderNodes(
  nodes: FileNode[],
  openItems: Set<string>,
  activeFilePath: string | undefined,
  onFileClick: (path: string) => void
): React.ReactNode {
  return nodes.map((node) => {
    const isDirectory = node.type === 'directory'
    const isOpen = openItems.has(node.path)
    const isActiveFile = !isDirectory && node.path === activeFilePath
    const gitClass = node.gitStatus ? GIT_STATUS_CLASS[node.gitStatus] || '' : ''

    const icon = isDirectory
      ? (isOpen
        ? <FolderOpenRegular className={styles.folderIcon} />
        : <FolderRegular className={styles.folderIcon} />)
      : <DocumentRegular />

    return (
      <TreeItem
        key={node.path}
        itemType={isDirectory ? 'branch' : 'leaf'}
        value={node.path}
        className={isActiveFile ? styles.treeItemActive : undefined}
        onClick={!isDirectory ? () => onFileClick(node.path) : undefined}
      >
        <TreeItemLayout iconBefore={icon} className={gitClass || undefined}>
          {node.name}
        </TreeItemLayout>
        {isDirectory && node.children && node.children.length > 0 && (
          <Tree>
            {renderNodes(node.children, openItems, activeFilePath, onFileClick)}
          </Tree>
        )}
      </TreeItem>
    )
  })
}

export function FileTree({ worktreePath, isActive }: Props) {
  const [tree, setTree] = useState<FileNode[] | null>(null)
  const [openItems, setOpenItems] = useState<Set<string>>(() => new Set([worktreePath]))
  const activeTabId = useAppStore((s) => s.activeTabId)
  const tabs = useAppStore((s) => s.tabs)
  const { openFileTab } = useAppStore()

  const activeTab = tabs.find((t) => t.id === activeTabId)
  const activeFilePath = activeTab?.type === 'file' ? activeTab.filePath : undefined

  const fetchTree = useCallback(() => {
    window.api.fs.getTreeWithStatus(worktreePath).then((nodes: FileNode[]) => {
      const root: FileNode = {
        name: basenameSafe(toPosixPath(worktreePath)),
        path: worktreePath,
        type: 'directory',
        children: nodes,
      }
      setTree([root])
    }).catch(() => {})
  }, [worktreePath])

  // Reset open state when workspace changes
  useEffect(() => {
    setOpenItems(new Set([worktreePath]))
  }, [worktreePath])

  useEffect(() => {
    fetchTree()
  }, [fetchTree])

  useEffect(() => {
    window.api.fs.watchDir(worktreePath)
    const unsub = window.api.fs.onDirChanged((changedDir: string) => {
      if (changedDir === worktreePath) fetchTree()
    })
    return () => {
      unsub()
      window.api.fs.unwatchDir(worktreePath)
    }
  }, [worktreePath, fetchTree])

  useEffect(() => {
    if (isActive) fetchTree()
  }, [isActive, fetchTree])

  const handleOpenChange = useCallback((_event: TreeOpenChangeEvent, data: TreeOpenChangeData) => {
    const isAlt = (_event.nativeEvent as KeyboardEvent | MouseEvent).altKey === true
    if (isAlt && tree) {
      const targetPath = data.value as string
      const node = findNode(tree, targetPath)
      if (node) {
        const descendants = collectDescendantPaths(node)
        setOpenItems((prev) => {
          const newOpen = new Set(prev)
          if (data.open) {
            for (const p of descendants) newOpen.add(p)
          } else {
            for (const p of descendants) newOpen.delete(p)
          }
          return newOpen
        })
      }
    } else {
      setOpenItems(new Set(data.openItems))
    }
  }, [tree])

  if (!tree) {
    return (
      <div className={styles.emptyState}>
        <span className={styles.emptyText}>Loading files...</span>
      </div>
    )
  }

  return (
    <div className={styles.treeContainer}>
      <Tree
        aria-label="File tree"
        size="small"
        openItems={openItems}
        onOpenChange={handleOpenChange}
      >
        {renderNodes(tree, openItems, activeFilePath, openFileTab)}
      </Tree>
    </div>
  )
}
