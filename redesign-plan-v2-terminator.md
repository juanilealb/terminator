# Plan de RediseÃ±o v2: Terminator Windows â†’ Nivel Conductor
## Afinado al codebase real

---

## 1. Contexto TÃ©cnico Real

Tu app es un **fork de [@owengretzinger](https://github.com/owengretzinger)** portado de macOS a Windows.

| Capa | TecnologÃ­a |
|------|-----------|
| Framework | **Electron 40** |
| UI | **React 19 + TypeScript** (strict) |
| State | **Zustand** |
| Editor | **Monaco Editor** |
| Terminal | **ghostty-web + node-pty** (ConPTY en Windows) |
| Build | **electron-vite + Bun** |
| Packaging | **electron-builder** (NSIS) |
| Tests | **Playwright** |

**Estructura del proyecto:**
```
terminator/
â”œâ”€â”€ desktop/
â”‚   â”œâ”€â”€ src/
â”‚   â”‚   â”œâ”€â”€ main/           â† Main process (PTY, git, files, IPC, hooks)
â”‚   â”‚   â”œâ”€â”€ preload/        â† Context bridge (window.api)
â”‚   â”‚   â”œâ”€â”€ renderer/       â† React UI (components, store, hooks)
â”‚   â”‚   â””â”€â”€ shared/         â† Shared utilities
â”‚   â”œâ”€â”€ claude-hooks/       â† Claude Code hook scripts
â”‚   â”œâ”€â”€ codex-hooks/        â† Codex hook scripts
â”‚   â””â”€â”€ e2e/                â† Playwright tests
â””â”€â”€ landing-page/
```

**Lo que esto significa para el rediseÃ±o:**
- Todo el CSS estÃ¡ en `desktop/src/renderer/` â€” ahÃ­ hay que atacar
- React 19 = podÃ©s usar todas las features modernas
- Zustand = el state management ya estÃ¡ limpio
- Monaco ya estÃ¡ integrado = no hay que tocar el editor
- ghostty-web ya maneja la terminal = solo hay que tematizarla

---

## 2. Archivos CSS Clave a Modificar

Basado en la estructura tÃ­pica de Electron + React + electron-vite, los archivos que tenÃ©s que tocar son:

```
desktop/src/renderer/
â”œâ”€â”€ src/
â”‚   â”œâ”€â”€ App.tsx                    â† Layout principal (3 columnas)
â”‚   â”œâ”€â”€ App.css / index.css        â† Estilos globales â† ESTE ES EL MÃS IMPORTANTE
â”‚   â”œâ”€â”€ components/
â”‚   â”‚   â”œâ”€â”€ Sidebar/               â† Panel izquierdo
â”‚   â”‚   â”‚   â”œâ”€â”€ Sidebar.tsx
â”‚   â”‚   â”‚   â””â”€â”€ Sidebar.css        â† REDISEÃ‘AR
â”‚   â”‚   â”œâ”€â”€ Terminal/              â† Terminal ghostty-web
â”‚   â”‚   â”‚   â””â”€â”€ Terminal.css       â† TEMATIZAR
â”‚   â”‚   â”œâ”€â”€ FileTree/              â† Panel derecho - Files
â”‚   â”‚   â”‚   â””â”€â”€ FileTree.css       â† REDISEÃ‘AR
â”‚   â”‚   â”œâ”€â”€ Changes/               â† Panel derecho - Changes
â”‚   â”‚   â”‚   â””â”€â”€ Changes.css        â† REDISEÃ‘AR
â”‚   â”‚   â””â”€â”€ ... otros componentes
â”‚   â”œâ”€â”€ store/                     â† Zustand stores (no tocar para UI)
â”‚   â””â”€â”€ hooks/                     â† Custom hooks (no tocar para UI)
```

> **NOTA:** Los nombres exactos de archivos pueden variar. Antes de empezar, 
> corrÃ© `find desktop/src/renderer -name "*.css" -o -name "*.scss"` para ver 
> todos los archivos de estilo, y `find desktop/src/renderer -name "*.tsx"` 
> para ver todos los componentes.

---

## 3. Paso a Paso de ImplementaciÃ³n

### FASE 1: Variables CSS Globales (30 min â€” Mayor impacto)

**Archivo:** `desktop/src/renderer/src/index.css` (o donde estÃ© el `:root`)

Reemplazar TODAS las variables CSS actuales con este sistema:

```css
:root {
  /* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
     CONDUCTOR-INSPIRED DARK THEME
     â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
  
  /* Backgrounds */
  --bg-app:           #0D1117;    /* Fondo principal de la app */
  --bg-sidebar:       #010409;    /* Sidebar mÃ¡s oscuro */
  --bg-panel:         #0D1117;    /* Paneles (centro, derecha) */
  --bg-surface:       #161B22;    /* Cards, items elevados */
  --bg-surface-hover: #1C2128;    /* Hover sobre items */
  --bg-surface-active:#2A313C;    /* Item seleccionado/activo */
  --bg-input:         #0D1117;    /* Inputs y campos */
  --bg-overlay:       #161B22;    /* Modales, dropdowns */
  
  /* Borders */
  --border-default:   #30363D;    /* Bordes principales */
  --border-muted:     #21262D;    /* Bordes sutiles */
  --border-emphasis:  #484F58;    /* Bordes con mÃ¡s presencia */
  
  /* Text */
  --text-primary:     #E6EDF3;    /* Texto principal */
  --text-secondary:   #8B949E;    /* Texto secundario */
  --text-tertiary:    #484F58;    /* Placeholder, disabled */
  --text-link:        #58A6FF;    /* Links */
  
  /* Accents */
  --accent-blue:      #58A6FF;    /* Acciones primarias */
  --accent-green:     #3FB950;    /* Ã‰xito, git adds */
  --accent-red:       #F85149;    /* Error, git removes */
  --accent-yellow:    #D29922;    /* Warning */
  --accent-purple:    #A371F7;    /* Tags especiales */
  --accent-orange:    #F0883E;    /* Notificaciones */
  
  /* Glow effects */
  --glow-blue:    rgba(88, 166, 255, 0.15);
  --glow-green:   rgba(63, 185, 80, 0.15);
  --glow-red:     rgba(248, 81, 73, 0.15);
  
  /* Typography */
  --font-sans:    'Geist Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --font-mono:    'Geist Mono', 'Cascadia Code', 'JetBrains Mono', 'Fira Code', monospace;
  --font-size-xs:   11px;
  --font-size-sm:   12px;
  --font-size-base: 13px;
  --font-size-md:   14px;
  --font-size-lg:   16px;
  --font-size-xl:   20px;
  
  /* Spacing */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-6: 24px;
  --space-8: 32px;
  
  /* Radius */
  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 8px;
  
  /* Shadows */
  --shadow-sm:  0 1px 2px rgba(0,0,0,0.3);
  --shadow-md:  0 4px 12px rgba(0,0,0,0.4);
  --shadow-lg:  0 8px 24px rgba(0,0,0,0.5);
  
  /* Transitions */
  --transition-fast:   150ms ease;
  --transition-normal: 200ms ease;
  
  /* Layout */
  --sidebar-width:    240px;
  --right-panel-width: 280px;
  --titlebar-height:   38px;
  --tab-height:        36px;
  --statusbar-height:  24px;
}
```

**Instalar Geist Font:**
```bash
bun add geist
```

En tu `index.tsx` o `main.tsx` del renderer:
```tsx
import 'geist/font/sans.css';
import 'geist/font/mono.css';
```

---

### FASE 2: Estilos Globales Base (20 min)

**Archivo:** `desktop/src/renderer/src/index.css`

```css
/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   RESET Y BASE
   â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */

*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: var(--font-sans);
  font-size: var(--font-size-base);
  color: var(--text-primary);
  background: var(--bg-app);
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
  overflow: hidden; /* Electron app, no body scroll */
}

/* â•â•â• SCROLLBARS (toda la app) â•â•â• */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background: var(--border-default);
  border-radius: 4px;
}
::-webkit-scrollbar-thumb:hover {
  background: var(--border-emphasis);
}
::-webkit-scrollbar-corner {
  background: transparent;
}

/* â•â•â• FOCUS STATES â•â•â• */
:focus-visible {
  outline: 2px solid var(--accent-blue);
  outline-offset: -2px;
  border-radius: var(--radius-sm);
}

/* â•â•â• SELECTION â•â•â• */
::selection {
  background: rgba(88, 166, 255, 0.3);
}

/* â•â•â• KBD ELEMENTS (keyboard shortcuts) â•â•â• */
kbd {
  display: inline-block;
  padding: 2px 6px;
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-sm);
  box-shadow: inset 0 -1px 0 var(--border-muted);
}
```

---

### FASE 3: Layout Principal â€” App.tsx (30 min)

Tu `App.tsx` deberÃ­a tener un layout de 3 columnas. BuscÃ¡ el componente principal y asegurate de que tenga esta estructura:

```css
/* â•â•â• APP LAYOUT â•â•â• */
.app-container {
  display: flex;
  height: 100vh;
  width: 100vw;
  background: var(--bg-app);
}

/* Titlebar de Electron (si tenÃ©s custom titlebar) */
.titlebar {
  height: var(--titlebar-height);
  background: var(--bg-sidebar);
  border-bottom: 1px solid var(--border-muted);
  display: flex;
  align-items: center;
  -webkit-app-region: drag; /* Permite arrastrar la ventana */
  padding: 0 var(--space-4);
}

.titlebar button {
  -webkit-app-region: no-drag;
}

/* Layout de 3 columnas */
.main-layout {
  display: flex;
  flex: 1;
  overflow: hidden;
}
```

---

### FASE 4: Sidebar RediseÃ±ado (1-2 horas)

Este es el componente que mÃ¡s cambia visualmente. BuscÃ¡ en `desktop/src/renderer/src/components/` algo como `Sidebar.tsx` o `ProjectList.tsx`.

**CSS del Sidebar:**

```css
/* â•â•â• SIDEBAR â•â•â• */
.sidebar {
  width: var(--sidebar-width);
  min-width: var(--sidebar-width);
  background: var(--bg-sidebar);
  border-right: 1px solid var(--border-default);
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

/* â”€â”€ Header del sidebar â”€â”€ */
.sidebar-header {
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--border-muted);
  display: flex;
  align-items: center;
  gap: var(--space-2);
  height: var(--titlebar-height);
}

.sidebar-header .app-name {
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--text-primary);
  letter-spacing: 0.5px;
  text-transform: lowercase;
}

/* â”€â”€ Lista de proyectos â”€â”€ */
.sidebar-content {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-2) 0;
}

/* â”€â”€ Proyecto (grupo) â”€â”€ */
.project-group {
  margin-bottom: var(--space-1);
}

.project-header {
  display: flex;
  align-items: center;
  padding: var(--space-1) var(--space-3);
  cursor: pointer;
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
  font-weight: 600;
  transition: color var(--transition-fast);
}

.project-header:hover {
  color: var(--text-primary);
}

.project-header .chevron {
  width: 16px;
  height: 16px;
  margin-right: var(--space-1);
  transition: transform var(--transition-fast);
}

.project-header .chevron.expanded {
  transform: rotate(90deg);
}

/* â”€â”€ Workspace item â”€â”€ */
.workspace-item {
  display: flex;
  align-items: center;
  padding: var(--space-1) var(--space-3);
  padding-left: var(--space-6);
  cursor: pointer;
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  transition: background var(--transition-fast), color var(--transition-fast);
  position: relative;
}

.workspace-item:hover {
  background: var(--bg-surface-hover);
  color: var(--text-primary);
}

.workspace-item.active {
  background: var(--bg-surface-active);
  color: var(--text-primary);
}

/* Barra indicadora de selecciÃ³n (como VS Code) */
.workspace-item.active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 4px;
  bottom: 4px;
  width: 2px;
  background: var(--accent-blue);
  border-radius: 1px;
}

.workspace-item .workspace-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* â”€â”€ Badge de branch (como Conductor) â”€â”€ */
.branch-badge {
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  color: var(--text-tertiary);
  margin-left: var(--space-2);
}

/* â”€â”€ Status badges â”€â”€ */
.status-badge {
  display: inline-flex;
  align-items: center;
  padding: 1px 6px;
  font-size: 10px;
  font-weight: 500;
  border-radius: 10px;
  border: 1px solid;
}

.status-badge.running {
  color: var(--accent-green);
  border-color: rgba(63, 185, 80, 0.3);
  background: var(--glow-green);
}

.status-badge.error {
  color: var(--accent-red);
  border-color: rgba(248, 81, 73, 0.3);
  background: var(--glow-red);
}

/* â”€â”€ Diff indicators (como "+312 -332" de Conductor) â”€â”€ */
.diff-stats {
  display: inline-flex;
  gap: var(--space-1);
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
}

.diff-add { color: var(--accent-green); }
.diff-remove { color: var(--accent-red); }

/* â”€â”€ Unread/activity indicator â”€â”€ */
.workspace-item .activity-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent-blue);
  margin-left: var(--space-2);
  flex-shrink: 0;
}

/* â”€â”€ Context menu trigger (aparece en hover) â”€â”€ */
.workspace-item .context-trigger {
  opacity: 0;
  padding: 2px;
  border-radius: var(--radius-sm);
  color: var(--text-tertiary);
  transition: opacity var(--transition-fast);
}

.workspace-item:hover .context-trigger {
  opacity: 1;
}

.workspace-item .context-trigger:hover {
  color: var(--text-primary);
  background: var(--bg-surface);
}

/* â”€â”€ Footer del sidebar â”€â”€ */
.sidebar-footer {
  border-top: 1px solid var(--border-muted);
  padding: var(--space-2);
}

.sidebar-footer-btn {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  padding: var(--space-1) var(--space-2);
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
  cursor: pointer;
  border-radius: var(--radius-md);
  transition: background var(--transition-fast), color var(--transition-fast);
}

.sidebar-footer-btn:hover {
  background: var(--bg-surface-hover);
  color: var(--text-primary);
}

.sidebar-footer-btn svg {
  width: 16px;
  height: 16px;
}
```

---

### FASE 5: Panel Central â€” Terminal Area (30 min)

```css
/* â•â•â• MAIN PANEL â•â•â• */
.main-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0; /* Crucial para flex overflow */
  background: var(--bg-panel);
}

/* â”€â”€ Tab bar â”€â”€ */
.tab-bar {
  display: flex;
  align-items: center;
  height: var(--tab-height);
  background: var(--bg-sidebar);
  border-bottom: 1px solid var(--border-default);
  padding: 0 var(--space-2);
  gap: 1px;
}

.tab {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: 0 var(--space-3);
  height: calc(var(--tab-height) - 1px);
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: color var(--transition-fast), border-color var(--transition-fast);
  white-space: nowrap;
}

.tab:hover {
  color: var(--text-primary);
}

.tab.active {
  color: var(--text-primary);
  border-bottom-color: var(--accent-blue);
}

.tab .close-btn {
  opacity: 0;
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  transition: opacity var(--transition-fast);
}

.tab:hover .close-btn { opacity: 0.6; }
.tab .close-btn:hover { opacity: 1; background: var(--bg-surface); }

/* â”€â”€ New tab button â”€â”€ */
.tab-new {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: var(--radius-sm);
  color: var(--text-tertiary);
  cursor: pointer;
  transition: background var(--transition-fast), color var(--transition-fast);
}

.tab-new:hover {
  background: var(--bg-surface-hover);
  color: var(--text-secondary);
}

/* â”€â”€ Terminal container â”€â”€ */
.terminal-container {
  flex: 1;
  padding: var(--space-2);
  overflow: hidden;
}

/* Tematizar ghostty-web */
.terminal-container .ghostty-surface {
  border-radius: var(--radius-md);
}

/* â”€â”€ Empty state (cuando no hay proyecto) â”€â”€ */
.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-4);
  padding: var(--space-8);
  /* SIN textura de fondo, limpio */
}

.empty-state .icon {
  width: 48px;
  height: 48px;
  color: var(--text-tertiary);
  opacity: 0.5;
}

.empty-state h2 {
  font-size: var(--font-size-xl);
  font-weight: 600;
  color: var(--text-primary);
  /* "terminator" en texto semi-transparente se queda pero mÃ¡s sutil */
}

.empty-state p {
  font-size: var(--font-size-base);
  color: var(--text-secondary);
  text-align: center;
  max-width: 400px;
}

.empty-state .cta-btn {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-4);
  background: var(--accent-blue);
  color: white;
  border: none;
  border-radius: var(--radius-md);
  font-size: var(--font-size-sm);
  font-weight: 500;
  cursor: pointer;
  transition: opacity var(--transition-fast);
}

.empty-state .cta-btn:hover {
  opacity: 0.9;
}

.empty-state .shortcut-hint {
  font-size: var(--font-size-sm);
  color: var(--text-tertiary);
}

/* â”€â”€ Status bar (footer) â”€â”€ */
.status-bar {
  height: var(--statusbar-height);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 var(--space-3);
  background: var(--bg-sidebar);
  border-top: 1px solid var(--border-muted);
  font-size: var(--font-size-xs);
  color: var(--text-tertiary);
}

.status-bar-left,
.status-bar-right {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.status-item {
  display: flex;
  align-items: center;
  gap: var(--space-1);
}

.status-item .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}
.status-item .dot.connected { background: var(--accent-green); }
.status-item .dot.disconnected { background: var(--accent-red); }
```

---

### FASE 6: Panel Derecho â€” Files & Changes (1 hora)

```css
/* â•â•â• RIGHT PANEL â•â•â• */
.right-panel {
  width: var(--right-panel-width);
  min-width: var(--right-panel-width);
  background: var(--bg-panel);
  border-left: 1px solid var(--border-default);
  display: flex;
  flex-direction: column;
}

/* â”€â”€ Panel tabs (Files / Changes) â”€â”€ */
.panel-tabs {
  display: flex;
  height: var(--tab-height);
  border-bottom: 1px solid var(--border-default);
}

.panel-tab {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  font-size: var(--font-size-sm);
  font-weight: 500;
  color: var(--text-secondary);
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: color var(--transition-fast);
}

.panel-tab:hover {
  color: var(--text-primary);
}

.panel-tab.active {
  color: var(--text-primary);
  border-bottom-color: var(--accent-blue);
}

/* Badge de conteo en "Changes" */
.panel-tab .count-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  font-size: 10px;
  font-weight: 600;
  color: var(--text-primary);
  background: var(--bg-surface-active);
  border-radius: 9px;
}

/* â”€â”€ File tree â”€â”€ */
.file-tree {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-2) 0;
}

.file-item {
  display: flex;
  align-items: center;
  padding: var(--space-1) var(--space-3);
  padding-left: calc(var(--space-3) + var(--indent-level, 0) * 16px);
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  cursor: pointer;
  transition: background var(--transition-fast);
}

.file-item:hover {
  background: var(--bg-surface-hover);
}

.file-item.selected {
  background: var(--bg-surface-active);
  color: var(--text-primary);
}

.file-item .file-icon {
  width: 16px;
  height: 16px;
  margin-right: var(--space-2);
  flex-shrink: 0;
}

.file-item .file-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Git status en file tree */
.file-item .git-status {
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  margin-left: auto;
  padding-left: var(--space-2);
}

.file-item .git-status.modified { color: var(--accent-yellow); }
.file-item .git-status.added { color: var(--accent-green); }
.file-item .git-status.deleted { color: var(--accent-red); }
.file-item .git-status.untracked { color: var(--text-tertiary); }

/* â”€â”€ Changes panel (git diff stats como Conductor) â”€â”€ */
.change-item {
  display: flex;
  align-items: center;
  padding: var(--space-1) var(--space-3);
  font-size: var(--font-size-sm);
  cursor: pointer;
  transition: background var(--transition-fast);
}

.change-item:hover {
  background: var(--bg-surface-hover);
}

.change-item .file-path {
  flex: 1;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
}

.change-item .diff-indicator {
  display: flex;
  gap: var(--space-1);
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  margin-left: var(--space-2);
}

.change-item .additions { color: var(--accent-green); }
.change-item .deletions { color: var(--accent-red); }
```

---

## 4. Checklist de EjecuciÃ³n con Claude Code

UsÃ¡ estos comandos con Claude Code para ejecutar el plan paso a paso:

### Descubrimiento (primero que nada):
```
ExplorÃ¡ la estructura de desktop/src/renderer/ y listÃ¡ todos los archivos 
.css y .tsx. Necesito saber exactamente quÃ© archivos de estilos existen 
y cÃ³mo estÃ¡n organizados los componentes.
```

### Fase 1 â€” Variables:
```
BuscÃ¡ dÃ³nde estÃ¡n definidas las CSS variables actuales (probablemente en 
index.css o un archivo de variables). Reemplazalas TODAS con el nuevo 
sistema de variables que te voy a pegar. No borres nada funcional, solo 
cambiÃ¡ colores y variables.
```

### Fase 2 â€” Base styles:
```
AgregÃ¡ los estilos globales base (scrollbar, focus states, selection, kbd) 
al archivo CSS principal. VerificÃ¡ que no rompan nada existente.
```

### Fase 3-6 â€” Componente por componente:
```
TomÃ¡ el componente [Sidebar/Terminal/FileTree/etc] y aplicÃ¡ los nuevos 
estilos. Mostrrame el diff antes de commitear.
```

---

## 5. Cosas que NO hay que tocar

- **Monaco Editor**: Ya se ve bien, tiene su propio theming. Si querÃ©s cambiarlo despuÃ©s, usÃ¡ `monaco.editor.defineTheme()` con los colores de la paleta.
- **ghostty-web terminal**: Solo necesitÃ¡s ajustar los colores del tema. BuscÃ¡ donde se configura el theme de ghostty y mapeÃ¡ los colores ANSI a tu paleta.
- **Zustand stores**: Nada de lÃ³gica, solo estilos.
- **Main process / preload**: No tocar nada ahÃ­.
- **IPC handlers**: Tampoco.

---

## 6. Extras Opcionales (post-rediseÃ±o)

### 6.1 Tema de Terminal ghostty-web
BuscÃ¡ en el cÃ³digo dÃ³nde se configura el terminal y agregÃ¡:
```ts
const terminalTheme = {
  background: '#0D1117',
  foreground: '#E6EDF3',
  cursor: '#58A6FF',
  selectionBackground: 'rgba(88, 166, 255, 0.3)',
  black: '#0D1117',
  red: '#F85149',
  green: '#3FB950',
  yellow: '#D29922',
  blue: '#58A6FF',
  magenta: '#A371F7',
  cyan: '#56D4DD',
  white: '#E6EDF3',
  brightBlack: '#484F58',
  brightRed: '#FF7B72',
  brightGreen: '#56D364',
  brightYellow: '#E3B341',
  brightBlue: '#79C0FF',
  brightMagenta: '#BC8CFF',
  brightCyan: '#76E3EA',
  brightWhite: '#F0F6FC',
};
```

### 6.2 Monaco Editor Theme
```ts
monaco.editor.defineTheme('terminator', {
  base: 'vs-dark',
  inherit: true,
  rules: [],
  colors: {
    'editor.background': '#0D1117',
    'editor.foreground': '#E6EDF3',
    'editorLineNumber.foreground': '#484F58',
    'editorLineNumber.activeForeground': '#E6EDF3',
    'editor.selectionBackground': '#264F78',
    'editor.inactiveSelectionBackground': '#264F7844',
  }
});
```

### 6.3 Instalar Lucide Icons (para reemplazar Ã­conos genÃ©ricos)
```bash
cd desktop
bun add lucide-react
```

Uso en componentes:
```tsx
import { FolderGit2, Terminal, Settings, Plus, ChevronRight } from 'lucide-react';
```

---

## 7. Prioridad de Impacto Visual

| # | Cambio | Impacto | Esfuerzo |
|---|--------|---------|----------|
| 1 | CSS Variables + fondo sÃ³lido | ðŸ”´ MÃ¡ximo | ðŸŸ¢ 30 min |
| 2 | Scrollbars custom | ðŸŸ  Alto | ðŸŸ¢ 5 min |
| 3 | TipografÃ­a Geist | ðŸŸ  Alto | ðŸŸ¢ 10 min |
| 4 | Bordes entre paneles | ðŸŸ  Alto | ðŸŸ¢ 10 min |
| 5 | Sidebar hover/active states | ðŸŸ¡ Medio | ðŸŸ¡ 30 min |
| 6 | Tab bar styling | ðŸŸ¡ Medio | ðŸŸ¡ 30 min |
| 7 | Empty state rediseÃ±o | ðŸŸ¡ Medio | ðŸŸ¡ 20 min |
| 8 | File tree con git status | ðŸŸ¡ Medio | ðŸŸ  1 hora |
| 9 | Status bar | ðŸŸ¢ Bajo | ðŸŸ¡ 20 min |
| 10 | Terminal theme | ðŸŸ¢ Bajo | ðŸŸ¢ 10 min |

**Total estimado: ~4-5 horas** para transformar completamente la app.

Los primeros 4 items (1 hora de trabajo) ya te van a dar un 70% de la mejora visual.

