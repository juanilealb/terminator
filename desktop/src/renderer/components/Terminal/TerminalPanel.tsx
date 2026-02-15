import { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { SearchAddon } from '@xterm/addon-search'
import { SerializeAddon } from '@xterm/addon-serialize'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { useAppStore } from '../../store/app-store'
import { subscribeTerminalUiActions } from '../../utils/terminal-actions'
import styles from './TerminalPanel.module.css'

const PR_POLL_HINT_EVENT = 'terminator:pr-poll-hint'
const INACTIVE_SERIALIZE_DELAY_MS = 30_000
const SERIALIZED_SCROLLBACK_LINES = 10_000
const PR_POLL_HINT_COMMAND_RE =
  /^(?:[A-Za-z_][A-Za-z0-9_]*=(?:'[^']*'|"[^"]*"|\S+)\s+)*(?:sudo\s+)?(?:(?:git\s+push)|(?:gh\s+pr\s+(?:create|ready|reopen|merge)))(?:\s|$)/

interface Props {
  ptyId: string
  active: boolean
}

interface ContextMenuState {
  x: number
  y: number
  hasSelection: boolean
}

export function TerminalPanel({ ptyId, active }: Props) {
  const termDivRef = useRef<HTMLDivElement>(null)
  const contextMenuRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const searchAddonRef = useRef<SearchAddon | null>(null)
  const serializeAddonRef = useRef<SerializeAddon | null>(null)
  const fitFnRef = useRef<(() => void) | null>(null)
  const terminalCleanupRef = useRef<(() => void) | null>(null)
  const ptyDataUnsubRef = useRef<(() => void) | null>(null)
  const inactiveDisposeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const serializedBufferRef = useRef('')
  const isRestoringRef = useRef(false)
  const activeRef = useRef(active)
  const copyOnSelectRef = useRef(false)
  const lastAutoCopiedRef = useRef('')
  const inputLineRef = useRef('')
  const terminalFontSize = useAppStore((s) => s.settings.terminalFontSize)
  const terminalCopyOnSelect = useAppStore((s) => s.settings.terminalCopyOnSelect)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)

  const writeClipboardText = async (text: string) => {
    await window.api.clipboard.writeText(text)
  }

  const copySelection = async () => {
    const term = termRef.current
    if (!term) return
    const selectedText = term.getSelection()
    if (!selectedText) return
    await writeClipboardText(selectedText)
  }

  const pasteFromClipboard = async () => {
    const text = await window.api.clipboard.readText()
    if (!text) return
    window.api.pty.write(ptyId, text)
  }

  const clearTerminalView = () => {
    const term = termRef.current
    if (!term) {
      serializedBufferRef.current = ''
      return
    }
    term.clear()
  }

  const findInTerminal = (query: string, backward = false) => {
    const searchAddon = searchAddonRef.current
    if (!searchAddon || !query) return

    if (backward) {
      searchAddon.findPrevious(query, { incremental: true })
      return
    }
    searchAddon.findNext(query, { incremental: true })
  }

  const openSearch = (seed?: string) => {
    setSearchOpen(true)
    if (typeof seed === 'string') {
      setSearchQuery(seed)
      if (seed) findInTerminal(seed)
    }
  }

  const emitPrPollHint = (command: string) => {
    const normalized = command.trim().toLowerCase()
    const kind = normalized.startsWith('git push') ? 'push' : 'pr'
    window.dispatchEvent(
      new CustomEvent(PR_POLL_HINT_EVENT, {
        detail: { ptyId, command, kind },
      })
    )
  }

  const detectPrPollHint = (chunk: string) => {
    // Remove cursor-control escape sequences so arrow keys do not pollute the command buffer.
    const cleaned = chunk
      .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')
      .replace(/\x1bO./g, '')
      .replace(/\x1b./g, '')

    for (const char of cleaned) {
      if (char === '\r' || char === '\n') {
        const command = inputLineRef.current.trim()
        if (command && PR_POLL_HINT_COMMAND_RE.test(command)) {
          emitPrPollHint(command)
        }
        inputLineRef.current = ''
        continue
      }

      if (char === '\u0003' || char === '\u0015') {
        inputLineRef.current = ''
        continue
      }

      if (char === '\u007f' || char === '\b') {
        inputLineRef.current = inputLineRef.current.slice(0, -1)
        continue
      }

      if (char < ' ' || char > '~') continue
      inputLineRef.current += char
      if (inputLineRef.current.length > 512) {
        inputLineRef.current = inputLineRef.current.slice(-512)
      }
    }
  }

  useEffect(() => {
    activeRef.current = active
  }, [active])

  useEffect(() => {
    copyOnSelectRef.current = terminalCopyOnSelect
  }, [terminalCopyOnSelect])

  useEffect(() => {
    if (!searchOpen) return
    const timer = setTimeout(() => searchInputRef.current?.focus(), 0)
    return () => clearTimeout(timer)
  }, [searchOpen])

  useEffect(() => {
    const closeMenu = (event: Event) => {
      const target = event.target as Node | null
      if (target && contextMenuRef.current?.contains(target)) return
      setContextMenu(null)
    }
    const closeMenuOnScroll = () => setContextMenu(null)
    window.addEventListener('mousedown', closeMenu, true)
    window.addEventListener('scroll', closeMenuOnScroll, true)
    return () => {
      window.removeEventListener('mousedown', closeMenu, true)
      window.removeEventListener('scroll', closeMenuOnScroll, true)
    }
  }, [])

  useEffect(() => {
    return subscribeTerminalUiActions(ptyId, (action) => {
      if (action === 'clear') {
        clearTerminalView()
        return
      }
      if (action === 'find') {
        const seed = termRef.current?.getSelection() ?? ''
        openSearch(seed)
      }
    })
  }, [ptyId])

  const clearInactiveDisposeTimer = () => {
    if (inactiveDisposeTimerRef.current) {
      clearTimeout(inactiveDisposeTimerRef.current)
      inactiveDisposeTimerRef.current = null
    }
  }

  const stopPtyDataListener = () => {
    ptyDataUnsubRef.current?.()
    ptyDataUnsubRef.current = null
  }

  const startPtyBufferListener = () => {
    stopPtyDataListener()
    ptyDataUnsubRef.current = window.api.pty.onData(ptyId, (data: string) => {
      serializedBufferRef.current += data
    })
  }

  const startPtyLiveListener = () => {
    stopPtyDataListener()
    ptyDataUnsubRef.current = window.api.pty.onData(ptyId, (data: string) => {
      const term = termRef.current
      if (!term) {
        serializedBufferRef.current += data
        return
      }
      term.write(data)
    })
  }

  const disposeTerminalInstance = () => {
    terminalCleanupRef.current?.()
    terminalCleanupRef.current = null
    termRef.current = null
    searchAddonRef.current = null
    serializeAddonRef.current = null
    fitFnRef.current = null
    inputLineRef.current = ''
  }

  const createTerminal = (restoreSnapshot = '') => {
    const termDiv = termDivRef.current
    if (!termDiv || termRef.current) return

    try {
      termDiv.innerHTML = ''
      const monoFont =
        getComputedStyle(document.documentElement).getPropertyValue('--font-mono').trim()
        || "'Cascadia Code', 'Cascadia Mono', 'JetBrains Mono', 'Consolas', monospace"

      const term = new Terminal({
        fontSize: useAppStore.getState().settings.terminalFontSize,
        fontFamily: monoFont,
        cursorBlink: true,
        cursorStyle: 'bar',
        scrollback: SERIALIZED_SCROLLBACK_LINES,
        theme: {
          background: '#140f16',
          foreground: '#f0eaf4',
          cursor: '#63d4d9',
          selectionBackground: 'rgba(99, 212, 217, 0.3)',
          black: '#140f16',
          red: '#ff6f78',
          green: '#48d18a',
          yellow: '#e3b56a',
          blue: '#58abff',
          magenta: '#c8a1ff',
          cyan: '#63d4d9',
          white: '#f0eaf4',
          brightBlack: '#87798d',
          brightRed: '#ff8f96',
          brightGreen: '#75dfaa',
          brightYellow: '#efcb90',
          brightBlue: '#82c2ff',
          brightMagenta: '#d9bcff',
          brightCyan: '#8be5e8',
          brightWhite: '#fff8ff',
        },
      })

      const fitAddon = new FitAddon()
      const searchAddon = new SearchAddon()
      const serializeAddon = new SerializeAddon()
      const webLinksAddon = new WebLinksAddon((event, uri) => {
        event.preventDefault()
        window.open(uri, '_blank')
      })

      term.loadAddon(fitAddon)
      term.loadAddon(searchAddon)
      term.loadAddon(serializeAddon)
      term.loadAddon(webLinksAddon)

      if (restoreSnapshot) {
        // Restore before opening to avoid expensive intermediate repaints.
        term.write(restoreSnapshot)
      }

      term.open(termDiv)
      termRef.current = term
      searchAddonRef.current = searchAddon
      serializeAddonRef.current = serializeAddon

      term.attachCustomKeyEventHandler((event: KeyboardEvent) => {
        if (event.type !== 'keydown') return true

        const key = event.key.toLowerCase()
        const hasCtrl = event.ctrlKey && !event.metaKey
        const hasShift = event.shiftKey
        const hasAlt = event.altKey

        const copyShortcut = hasCtrl && !hasAlt && hasShift && key === 'c'
        const copyInsertShortcut = hasCtrl && !hasAlt && !hasShift && key === 'insert'
        if (copyShortcut || copyInsertShortcut) {
          event.preventDefault()
          event.stopPropagation()
          void copySelection().catch(() => {})
          return false
        }

        const pasteShortcut = hasCtrl && !hasAlt && hasShift && key === 'v'
        const pasteInsertShortcut = !hasCtrl && !hasAlt && hasShift && key === 'insert'
        if (pasteShortcut || pasteInsertShortcut) {
          event.preventDefault()
          event.stopPropagation()
          void pasteFromClipboard().catch(() => {})
          return false
        }

        const findShortcut = hasCtrl && !hasAlt && !hasShift && key === 'f'
        if (findShortcut) {
          event.preventDefault()
          event.stopPropagation()
          openSearch(term.getSelection())
          return false
        }

        const isCtrlC = hasCtrl
          && !hasShift
          && !hasAlt
          && key === 'c'

        if (!isCtrlC || !term.hasSelection()) return true

        event.preventDefault()
        event.stopPropagation()
        void copySelection().catch(() => {})
        return false
      })

      const fitTerminal = () => {
        if (termRef.current !== term) return
        if (termDiv.clientWidth <= 0 || termDiv.clientHeight <= 0) return
        fitAddon.fit()
      }
      fitFnRef.current = fitTerminal

      // Defer fit until container has real dimensions.
      let fitAttempts = 0
      const tryFit = () => {
        if (termRef.current !== term) return
        if (termDiv.clientWidth > 0 && termDiv.clientHeight > 0) {
          fitTerminal()
        } else if (++fitAttempts < 30) {
          requestAnimationFrame(tryFit)
        }
      }
      requestAnimationFrame(tryFit)

      let resizeTimer: ReturnType<typeof setTimeout> | null = null
      const resizeObserver = new ResizeObserver(() => {
        if (resizeTimer) clearTimeout(resizeTimer)
        resizeTimer = setTimeout(() => {
          if (termRef.current === term) fitTerminal()
        }, 100)
      })
      resizeObserver.observe(termDiv)

      const settleTimer = setTimeout(() => {
        if (termRef.current === term) fitTerminal()
      }, 200)

      const onSelectionChangeDisposable = term.onSelectionChange(() => {
        if (!copyOnSelectRef.current) return
        const selectedText = term.getSelection()
        if (!selectedText) {
          lastAutoCopiedRef.current = ''
          return
        }
        if (selectedText === lastAutoCopiedRef.current) return
        lastAutoCopiedRef.current = selectedText
        void writeClipboardText(selectedText).catch(() => {})
      })

      const onContextMenu = (event: MouseEvent) => {
        event.preventDefault()
        event.stopPropagation()
        setContextMenu({
          x: event.clientX,
          y: event.clientY,
          hasSelection: term.hasSelection(),
        })
      }
      termDiv.addEventListener('contextmenu', onContextMenu)

      const onDataDisposable = term.onData((data: string) => {
        detectPrPollHint(data)
        window.api.pty.write(ptyId, data)
      })

      const onResizeDisposable = term.onResize(({ cols, rows }: { cols: number; rows: number }) => {
        window.api.pty.resize(ptyId, cols, rows)
      })

      terminalCleanupRef.current = () => {
        resizeObserver.disconnect()
        if (resizeTimer) clearTimeout(resizeTimer)
        clearTimeout(settleTimer)
        onSelectionChangeDisposable.dispose()
        onDataDisposable.dispose()
        onResizeDisposable.dispose()
        termDiv.removeEventListener('contextmenu', onContextMenu)
        term.dispose()

        if (termRef.current === term) termRef.current = null
        if (searchAddonRef.current === searchAddon) searchAddonRef.current = null
        if (serializeAddonRef.current === serializeAddon) serializeAddonRef.current = null
        if (fitFnRef.current === fitTerminal) fitFnRef.current = null
      }

      setTimeout(() => {
        if (termRef.current === term && activeRef.current) term.focus()
      }, 50)
    } catch (err) {
      console.error('Failed to initialize terminal:', err)
    }
  }

  const serializeAndDisposeTerminal = () => {
    const term = termRef.current
    const serializeAddon = serializeAddonRef.current
    if (!term || !serializeAddon) return

    try {
      serializedBufferRef.current = serializeAddon.serialize({
        scrollback: SERIALIZED_SCROLLBACK_LINES,
      })
    } catch (err) {
      console.error('Failed to serialize terminal buffer:', err)
      return
    }

    setSearchOpen(false)
    setSearchQuery('')
    setContextMenu(null)

    // Keep collecting PTY output while terminal is suspended.
    startPtyBufferListener()
    disposeTerminalInstance()
  }

  const restoreTerminal = () => {
    if (isRestoringRef.current || termRef.current) return
    isRestoringRef.current = true

    // Freeze buffered state before taking the restore snapshot.
    stopPtyDataListener()
    const snapshot = serializedBufferRef.current
    // Reconnect immediately; while term is null incoming data is buffered in-memory.
    startPtyLiveListener()
    createTerminal(snapshot)
    const term = termRef.current
    if (!term) {
      isRestoringRef.current = false
      return
    }

    // Replay PTY output that arrived after snapshot capture.
    const backlog = serializedBufferRef.current.slice(snapshot.length)
    if (backlog) term.write(backlog)
    serializedBufferRef.current = ''
    isRestoringRef.current = false
  }

  useEffect(() => {
    if (!termDivRef.current) return

    inputLineRef.current = ''
    setSearchOpen(false)
    setSearchQuery('')
    setContextMenu(null)

    createTerminal()
    startPtyLiveListener()

    return () => {
      clearInactiveDisposeTimer()
      stopPtyDataListener()
      disposeTerminalInstance()
      serializedBufferRef.current = ''
      isRestoringRef.current = false
      inputLineRef.current = ''
    }
  }, [ptyId])

  // Update font size on live terminals.
  useEffect(() => {
    const term = termRef.current
    if (!term) return

    term.options.fontSize = terminalFontSize
    fitFnRef.current?.()
  }, [terminalFontSize])

  // Focus + refit when this tab becomes active.
  useEffect(() => {
    clearInactiveDisposeTimer()

    if (active) {
      if (!termRef.current) restoreTerminal()
      fitFnRef.current?.()
      termRef.current?.focus()
      return
    }

    inactiveDisposeTimerRef.current = setTimeout(() => {
      serializeAndDisposeTerminal()
    }, INACTIVE_SERIALIZE_DELAY_MS)

    return () => clearInactiveDisposeTimer()
  }, [active])

  return (
    <div className={`${styles.terminalContainer} ${active ? styles.active : styles.hidden}`}>
      {searchOpen && (
        <div className={styles.searchBar}>
          <input
            ref={searchInputRef}
            className={styles.searchInput}
            value={searchQuery}
            onChange={(e) => {
              const value = e.target.value
              setSearchQuery(value)
              findInTerminal(value)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault()
                setSearchOpen(false)
                termRef.current?.focus()
                return
              }
              if (e.key === 'Enter') {
                e.preventDefault()
                findInTerminal(searchQuery, e.shiftKey)
              }
            }}
            placeholder="Find in terminal"
          />
          <button
            className={styles.searchBtn}
            onClick={() => findInTerminal(searchQuery, true)}
            title="Find previous"
          >
            Up
          </button>
          <button
            className={styles.searchBtn}
            onClick={() => findInTerminal(searchQuery)}
            title="Find next"
          >
            Down
          </button>
          <button
            className={styles.searchBtn}
            onClick={() => {
              setSearchOpen(false)
              termRef.current?.focus()
            }}
            title="Close"
          >
            Close
          </button>
        </div>
      )}

      {contextMenu && (
        <div
          ref={contextMenuRef}
          className={styles.contextMenu}
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          <button
            className={styles.contextMenuItem}
            onClick={() => {
              setContextMenu(null)
              void copySelection().catch(() => {})
            }}
            disabled={!contextMenu.hasSelection}
          >
            Copy
          </button>
          <button
            className={styles.contextMenuItem}
            onClick={() => {
              setContextMenu(null)
              void pasteFromClipboard().catch(() => {})
            }}
          >
            Paste
          </button>
          <button
            className={styles.contextMenuItem}
            onClick={() => {
              setContextMenu(null)
              openSearch(termRef.current?.getSelection())
            }}
          >
            Find
          </button>
          <button
            className={styles.contextMenuItem}
            onClick={() => {
              setContextMenu(null)
              clearTerminalView()
            }}
          >
            Clear
          </button>
        </div>
      )}

      {/* Separate div for xterm - not managed by React. */}
      <div ref={termDivRef} className={styles.terminalInner} />
    </div>
  )
}
