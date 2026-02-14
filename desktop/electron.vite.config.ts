import { defineConfig } from 'electron-vite'
import { resolve } from 'path'

const sharedPath = resolve(__dirname, 'src/shared').replace(/\\/g, '/')
const mainAlias = [
  { find: /^@shared\/(.*)$/, replacement: `${sharedPath}/$1` },
  { find: '@shared', replacement: sharedPath },
]
const rendererPlatformPath = resolve(__dirname, 'src/shared/platform.renderer.ts').replace(/\\/g, '/')
const rendererAlias = [
  { find: '@shared/platform', replacement: rendererPlatformPath },
  { find: /^@shared\/(.*)$/, replacement: `${sharedPath}/$1` },
  { find: '@shared', replacement: sharedPath },
]

function onwarnFilterPierreUseClient(warning: any, warn: (warning: any) => void) {
  const isModuleDirective = warning?.code === 'MODULE_LEVEL_DIRECTIVE'
  const isPierreReactFile = typeof warning?.id === 'string'
    && warning.id.includes('/node_modules/@pierre/diffs/dist/react/')
  const isUseClientDirective = typeof warning?.message === 'string'
    && warning.message.includes('"use client"')

  if (isModuleDirective && isPierreReactFile && isUseClientDirective) {
    return
  }
  warn(warning)
}

export default defineConfig({
  main: {
    resolve: {
      alias: mainAlias
    }
  },
  preload: {
    resolve: {
      alias: mainAlias
    }
  },
  renderer: {
    build: {
      rollupOptions: {
        onwarn: onwarnFilterPierreUseClient,
      },
    },
    resolve: {
      alias: rendererAlias
    }
  }
})
