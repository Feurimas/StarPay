import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { openSync } from 'node:fs'
import type { Plugin } from 'vite'

const API_URL = 'http://127.0.0.1:3001/health'

async function apiIsUp(): Promise<boolean> {
  try {
    const res = await fetch(API_URL, { signal: AbortSignal.timeout(1500) })
    return res.ok
  } catch {
    return false
  }
}

/**
 * Keeps the StarPay API (and its Postgres container) running next to the dev server. After a sandbox pause and
 * resume only the dev server comes back on its own, which made sign up and sign in fail with "cannot reach the server".
 */
export function starpayBackend(): Plugin {
  return {
    name: 'starpay-backend',
    apply: 'serve',
    configureServer(server) {
      let child: ChildProcess | null = null
      let stopped = false

      const start = () => {
        execFile('docker', ['start', 'postgres'], () => undefined) // no-op when it is already running
        const log = openSync('/tmp/api.log', 'a')
        child = spawn('bun', ['run', 'server/index.ts'], { cwd: server.config.root, stdio: ['ignore', log, log] })
        child.on('exit', () => {
          child = null
        })
      }

      const tick = async () => {
        if (stopped || child) return
        if (!(await apiIsUp())) start()
      }

      void tick()
      const timer = setInterval(() => void tick(), 5000)
      server.httpServer?.once('close', () => {
        stopped = true
        clearInterval(timer)
        child?.kill()
      })
    },
  }
}
