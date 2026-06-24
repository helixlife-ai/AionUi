#!/usr/bin/env tsx
/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * `dev:webui` — run the Agent Hub renderer with Vite HMR against a live
 * aioncore + static-server backend, without Electron.
 *
 * Two concurrent processes:
 *   1. backend  : `tsx scripts/webui.ts` — aioncore + static server on 25809
 *                 (AIONUI_OPEN_BROWSER=0 so we open the Vite URL instead).
 *   2. renderer : `vite --config vite.config.renderer.ts` — HMR on 5173,
 *                 proxying /api, /ws, /login, /logout to 25809.
 *
 * Open http://localhost:5173/#/guid — renderer edits hot-reload; API/WS reach
 * aioncore via the proxy. Set AIONUI_SERIAL_NUMBER before launching so
 * /api/identity returns the device SN:
 *
 *   AIONUI_SERIAL_NUMBER=2605-... bun run dev:webui
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), '..');

type Label = 'backend' | 'renderer';

function spawnLabeled(label: Label, command: string, args: string[], env: NodeJS.ProcessEnv): ChildProcess {
  const child = spawn(command, args, {
    cwd: repoRoot,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true,
  });

  const prefix = label === 'backend' ? '\x1b[36m[backend]\x1b[0m ' : '\x1b[35m[renderer]\x1b[0m ';
  const pipe = (stream: NodeJS.ReadableStream | null) => {
    if (!stream) return;
    let buffer = '';
    stream.on('data', (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        process.stdout.write(`${prefix}${line}\n`);
      }
    });
    stream.on('end', () => {
      if (buffer.length > 0) process.stdout.write(`${prefix}${buffer}\n`);
    });
  };
  pipe(child.stdout);
  pipe(child.stderr);

  return child;
}

async function main(): Promise<void> {
  // Backend inherits the parent env (incl. AIONUI_SERIAL_NUMBER); just suppress
  // its browser auto-open so the Vite URL is the one the user lands on.
  const backendEnv: NodeJS.ProcessEnv = { ...process.env, AIONUI_OPEN_BROWSER: '0' };
  const rendererEnv: NodeJS.ProcessEnv = { ...process.env };

  const backend = spawnLabeled('backend', 'tsx', ['scripts/webui.ts'], backendEnv);
  const renderer = spawnLabeled('renderer', 'vite', ['--config', 'vite.config.renderer.ts'], rendererEnv);

  const teardown = (reason: string) => {
    process.stderr.write(`\n[dev:webui] stopping (${reason})\n`);
    for (const child of [renderer, backend]) {
      if (!child.killed) {
        try {
          // SIGINT first so vite/webui clean up; escalate if needed.
          child.kill('SIGINT');
          setTimeout(() => {
            if (!child.killed) child.kill('SIGKILL');
          }, 3000).unref();
        } catch {
          // ignore
        }
      }
    }
    process.exit(0);
  };

  let exited = false;
  for (const [label, child] of [['renderer', renderer], ['backend', backend]] as const) {
    child.on('exit', (code, signal) => {
      if (exited) return;
      exited = true;
      teardown(`${label} exited (code=${code} signal=${signal})`);
    });
  }

  process.on('SIGINT', () => teardown('SIGINT'));
  process.on('SIGTERM', () => teardown('SIGTERM'));
}

main().catch((error) => {
  console.error('[dev:webui] fatal:', error);
  process.exit(1);
});
