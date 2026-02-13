const { spawnSync } = require('child_process')

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...options,
  })
  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

if (process.platform === 'darwin') {
  run('bash', ['scripts/patch-electron-dev.sh'])
}

run('bunx', ['electron-rebuild'])
