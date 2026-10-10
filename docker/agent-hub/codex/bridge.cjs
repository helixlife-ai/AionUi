const { spawn } = require('node:child_process');
const path = require('node:path');
const readline = require('node:readline');
const { loadHistory } = require('./history.cjs');

/** Gate a native handshake until the thread and its restored context are durable. */
function createRecoveryBridge({ sendNative, sendClient, readHistory, warn, timeoutMs = 20000 }) {
  let pending = null;
  let terminalError = null;
  let sequence = 0;
  const aliases = new Map();
  const privateIds = new Set();
  const internalId = () => `studio-history-${++sequence}`;
  const rewrite = (frame) => {
    const replacement = aliases.get(frame.params?.threadId);
    return replacement ? { ...frame, params: { ...frame.params, threadId: replacement } } : frame;
  };
  const finish = (response, success = false) => {
    const work = pending;
    pending = null;
    clearTimeout(work.timer);
    if (success && work.originalError) {
      aliases.set(work.request.params.threadId, work.result.result.thread.id);
    }
    sendClient({ ...response, id: work.request.id });
    if (success) work.notifications.forEach(sendClient);
    for (const frame of work.queue) {
      if (success) sendNative(rewrite(frame));
      else if (frame.id !== undefined) sendClient({ id: frame.id, error: response.error });
    }
  };
  const fail = (detail) => {
    warn(`Codex history recovery refused: ${detail}`);
    const response = pending.originalError ?? {
      error: { code: -32603, message: `Studio Codex history recovery failed: ${detail}` },
    };
    terminalError = response.error;
    finish(response);
  };
  const requestInternal = (method, params, stage) => {
    pending.stage = stage;
    pending.internalId = internalId();
    privateIds.add(pending.internalId);
    sendNative({ jsonrpc: '2.0', id: pending.internalId, method, params });
  };
  const persist = () =>
    requestInternal('thread/section/move', { threadId: pending.result.result.thread.id, sectionId: null }, 'persist');
  const hydrate = (frame) => {
    pending.result = frame;
    const threadId = frame.result?.thread?.id;
    if (!threadId || frame.result.thread.ephemeral) return fail('No durable native thread was created');
    if (pending.history?.items.length) {
      requestInternal('thread/inject_items', { threadId, items: pending.history.items }, 'inject');
    } else persist();
  };
  return {
    fromClient(frame) {
      if (terminalError && frame.method) {
        if (frame.id !== undefined) sendClient({ id: frame.id, error: terminalError });
        return;
      }
      // Replies to native MCP/auth requests must not be held behind the handshake.
      if (pending && frame.method) {
        pending.queue.push(frame);
        return;
      }
      frame = rewrite(frame);
      if (['thread/start', 'thread/resume'].includes(frame.method) && frame.id !== undefined) {
        pending = { request: frame, queue: [], notifications: [], stage: 'initial' };
        pending.timer = setTimeout(() => fail('Native handshake timed out'), timeoutMs);
      }
      sendNative(frame);
    },
    fromNative(frame) {
      // A timed-out thread must never become visible later without verified context.
      if (terminalError) return;
      if (!pending) {
        if (!privateIds.has(frame.id)) sendClient(frame);
        return;
      }
      if (frame.method && frame.id === undefined) {
        pending.notifications.push(frame);
        return;
      }
      if (pending.stage === 'initial' && frame.id === pending.request.id) {
        if (!frame.error) {
          if (pending.request.method === 'thread/resume') return finish(frame, true);
          return hydrate(frame);
        }
        if (
          pending.request.method !== 'thread/resume' ||
          !frame.error.message?.includes(`no rollout found for thread id ${pending.request.params.threadId}`)
        ) {
          return finish(frame);
        }
        pending.originalError = frame;
        try {
          pending.history = readHistory(pending.request.params);
          if (!pending.history) return fail('No matching Studio conversation');
          const { threadId: _id, path: _path, history: _history, ...params } = pending.request.params;
          requestInternal('thread/start', { ...params, ephemeral: false }, 'create');
        } catch (error) {
          fail(error.message);
        }
        return;
      }
      if (frame.id !== pending.internalId) {
        if (!privateIds.has(frame.id)) sendClient(frame);
        return;
      }
      if (frame.error) return fail(frame.error.message);
      if (pending.stage === 'create') return hydrate(frame);
      if (pending.stage === 'inject') return persist();
      if (pending.stage === 'persist') {
        if (pending.originalError) {
          warn(`Codex history recovered for ${pending.history.conversationId}; items=${pending.history.items.length}`);
        }
        finish(pending.result, true);
      }
    },
    close() {
      if (pending) clearTimeout(pending.timer);
    },
  };
}

/** Run the installed CLI unchanged behind a deployment-owned stdio adapter. */
function runAppServerBridge(real, args) {
  const child = spawn(real, args, { stdio: ['pipe', 'pipe', 'inherit'] });
  const bridge = createRecoveryBridge({
    sendNative: (frame) => child.stdin.write(`${JSON.stringify(frame)}\n`),
    sendClient: (frame) => process.stdout.write(`${JSON.stringify(frame)}\n`),
    readHistory: (params) => {
      const databasePath = path.join(process.env.AIONUI_DATA_DIR || '/data', 'aionui-backend.db');
      return loadHistory({ databasePath, workspace: params.cwd || process.cwd(), threadId: params.threadId });
    },
    warn: (detail) => console.error(`[agent-hub] ${detail}`),
  });
  const parent = readline.createInterface({ input: process.stdin });
  const native = readline.createInterface({ input: child.stdout });
  parent.on('line', (line) => {
    let frame;
    try {
      frame = JSON.parse(line);
    } catch {
      child.stdin.write(`${line}\n`);
      return;
    }
    try {
      bridge.fromClient(frame);
    } catch (error) {
      console.error(`[agent-hub] Codex bridge failed: ${error.message}`);
      child.kill('SIGTERM');
    }
  });
  native.on('line', (line) => {
    try {
      bridge.fromNative(JSON.parse(line));
    } catch (error) {
      console.error(`[agent-hub] Codex bridge failed: ${error.message}`);
      child.kill('SIGTERM');
    }
  });
  parent.on('close', () => child.stdin.end());
  const signals = ['SIGINT', 'SIGTERM'].map((signal) => {
    const forward = () => child.kill(signal);
    process.once(signal, forward);
    return [signal, forward];
  });
  child.stdin.on('error', () => child.kill('SIGTERM'));
  child.once('exit', () => {
    signals.forEach(([signal, forward]) => process.removeListener(signal, forward));
    bridge.close();
    parent.close();
    native.close();
  });
  return child;
}

module.exports = { createRecoveryBridge, runAppServerBridge };
