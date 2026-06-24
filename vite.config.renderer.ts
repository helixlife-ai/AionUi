/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Standalone Vite config for `dev:webui` — runs ONLY the renderer with HMR,
 * while `scripts/webui.ts` (started in parallel by scripts/dev-webui.ts) owns
 * aioncore + the static server on port 25809. This config proxies every
 * backend path (/api, /ws, /login, /logout) to that static server, so the
 * renderer talks to the real backend same-origin, and `/api/identity` is
 * served by the static server (reading AIONUI_SERIAL_NUMBER).
 *
 * The renderer section mirrors packages/desktop/electron.vite.config.ts.
 * Keep the plugin/alias/define/optimizeDeps blocks in sync with that file.
 */

import { defineConfig } from 'vite';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import UnoCSS from 'unocss/vite';
import unoConfig from './uno.config.ts';

const rootPackageJson = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf-8')) as { version: string };

const WEBUI_BACKEND_TARGET = process.env.AIONUI_DEV_BACKEND ?? 'http://127.0.0.1:25809';

// Icon Park transform plugin — must match electron.vite.config.ts verbatim.
function iconParkPlugin() {
  return {
    name: 'vite-plugin-icon-park',
    enforce: 'pre' as const,
    transform(source: string, id: string) {
      if (!id.endsWith('.tsx') || id.includes('node_modules')) return null;
      if (!source.includes('@icon-park/react')) return null;
      const transformedSource = source.replace(
        /import\s+\{\s+([a-zA-Z, ]*)\s+\}\s+from\s+['"]@icon-park\/react['"](;?)/g,
        function (str, match) {
          if (!match) return str;
          const components = match.split(',');
          const importComponent = str.replace(
            match,
            components.map((key: string) => `${key} as _${key.trim()}`).join(', ')
          );
          const hoc = `import IconParkHOC from '@renderer/components/IconParkHOC';
          ${components.map((key: string) => `const ${key.trim()} = IconParkHOC(_${key.trim()})`).join(';\n')}`;
          return importComponent + ';' + hoc;
        }
      );
      if (transformedSource !== source) return { code: transformedSource, map: null } as { code: string; map: null };
      return null;
    },
  };
}

const rendererRoot = resolve(__dirname, 'packages/desktop/src/renderer');

export default defineConfig({
  root: rendererRoot,
  base: './',
  publicDir: resolve(__dirname, 'public'),
  appType: 'mpa',
  server: {
    // Bind all interfaces so colleagues on the LAN can preview via the dev
    // machine's IP (e.g. http://192.168.x.x:5173). HMR follows the page host
    // (no explicit hmr.host override) so remote browsers reconnect to the dev
    // machine, not to their own localhost.
    host: true,
    port: 5173,
    strictPort: false,
    open: true,
    proxy: {
      // WebSocket upgrades (app realtime) + STT stream — ws:true also covers
      // /api/stt/stream. Non-WS /api requests (incl. /api/identity) proxy as
      // normal HTTP to the static server, which forwards to aioncore.
      '/api': { target: WEBUI_BACKEND_TARGET, changeOrigin: true, ws: true },
      '/ws': { target: WEBUI_BACKEND_TARGET, changeOrigin: true, ws: true },
      '/login': { target: WEBUI_BACKEND_TARGET, changeOrigin: true },
      '/logout': { target: WEBUI_BACKEND_TARGET, changeOrigin: true },
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'packages/desktop/src'),
      '@common': resolve(__dirname, 'packages/desktop/src/common'),
      '@renderer': rendererRoot,
      '@process': resolve(__dirname, 'packages/desktop/src/process'),
      '@worker': resolve(__dirname, 'packages/desktop/src/process/worker'),
      streamdown: resolve(__dirname, 'node_modules/streamdown/dist/index.js'),
    },
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.css'],
    dedupe: [
      'react',
      'react-dom',
      'react-router-dom',
      '@codemirror/state',
      '@codemirror/view',
      '@codemirror/language',
      '@lezer/highlight',
    ],
  },
  plugins: [UnoCSS(unoConfig), iconParkPlugin()],
  define: {
    'process.env.NODE_ENV': JSON.stringify('development'),
    'process.env.env': JSON.stringify(process.env.env),
    'process.env.AIONUI_MULTI_INSTANCE': JSON.stringify(process.env.AIONUI_MULTI_INSTANCE ?? ''),
    'process.env.SENTRY_DSN': JSON.stringify(process.env.SENTRY_DSN ?? ''),
    __APP_VERSION__: JSON.stringify(rootPackageJson.version),
    global: 'globalThis',
  },
  optimizeDeps: {
    exclude: ['electron'],
    include: [
      'react',
      'react-dom',
      'react-router-dom',
      'react-i18next',
      'i18next',
      '@arco-design/web-react',
      '@icon-park/react',
      'react-markdown',
      'react-syntax-highlighter',
      'react-virtuoso',
      'classnames',
      'swr',
      'eventemitter3',
      'katex',
      'diff2html',
      'remark-gfm',
      'remark-math',
      'remark-breaks',
      'rehype-raw',
      'rehype-katex',
      '@uiw/react-codemirror',
      '@codemirror/lang-markdown',
      '@codemirror/language',
    ],
  },
});
