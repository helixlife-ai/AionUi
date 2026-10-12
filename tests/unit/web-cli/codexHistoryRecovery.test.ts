import { createRequire } from 'node:module';
import { describe, expect, it, vi, afterEach } from 'vitest';

const require = createRequire(import.meta.url);
type Frame = {
  id?: number | string;
  method?: string;
  params?: Record<string, unknown>;
  result?: { thread: { id: string } };
  error?: { code: number; message: string };
};
type History = { conversationId: string; items: unknown[] };
const { createRecoveryBridge } = require('../../../docker/agent-hub/codex/bridge.cjs') as {
  createRecoveryBridge: (ports: {
    sendNative: (frame: Frame) => void;
    sendClient: (frame: Frame) => void;
    readHistory: () => History | null;
    warn: () => void;
    timeoutMs?: number;
  }) => { fromClient: (frame: Frame) => void; fromNative: (frame: Frame) => void; close: () => void };
};
const { historyItems } = require('../../../docker/agent-hub/codex/history.cjs') as {
  historyItems: (
    messages: { type: string; position: string; content: string }[]
  ) => { role: string; content: { text: string }[] }[];
};
const bridges: { close: () => void }[] = [];
afterEach(() => {
  bridges.forEach((bridge) => bridge.close());
  bridges.length = 0;
  vi.useRealTimers();
});
function fixture(history: History | null = { conversationId: 'studio-id', items: [{ type: 'message' }] }) {
  const native: Frame[] = [];
  const client: Frame[] = [];
  const readHistory = vi.fn(() => history);
  const bridge = createRecoveryBridge({
    sendNative: (frame) => native.push(frame),
    sendClient: (frame) => client.push(frame),
    readHistory,
    warn: vi.fn(),
    timeoutMs: 100,
  });
  bridges.push(bridge);
  return { bridge, native, client, readHistory };
}
const resume: Frame = {
  id: 1,
  method: 'thread/resume',
  params: { threadId: 'old-id', cwd: '/workspace', sandbox: 'read-only' },
};
const missing: Frame = { id: 1, error: { code: -32603, message: 'no rollout found for thread id old-id' } };
function recover(f: ReturnType<typeof fixture>) {
  f.bridge.fromClient(resume);
  f.bridge.fromNative(missing);
  f.bridge.fromNative({ id: f.native.at(-1)?.id, result: { thread: { id: 'new-id' } } });
}
describe('Codex historical thread recovery', () => {
  it('preserves successful native resumes without reinjecting or moving them', () => {
    const f = fixture();
    f.bridge.fromClient(resume);
    const response: Frame = { id: 1, result: { thread: { id: 'old-id' } } };
    f.bridge.fromNative(response);
    expect(f.client).toEqual([response]);
    expect(f.readHistory).not.toHaveBeenCalled();
    expect(f.native).toEqual([resume]);
  });
  it('does not rebuild threads for unrelated native errors', () => {
    const f = fixture();
    f.bridge.fromClient(resume);
    const error = { id: 1, error: { code: -1, message: 'permission denied' } };
    f.bridge.fromNative(error);
    expect(f.client).toEqual([error]);
    expect(f.native).toHaveLength(1);
  });
  it('refuses missing histories instead of silently starting without context', () => {
    const f = fixture(null);
    f.bridge.fromClient(resume);
    f.bridge.fromNative(missing);
    expect(f.client).toEqual([missing]);
    expect(f.native).toHaveLength(1);
  });
  it('injects context before exposing the replacement native thread', () => {
    const f = fixture();
    recover(f);
    expect(f.client).toEqual([]);
    expect(f.native.at(-1)?.method).toBe('thread/inject_items');
    expect(f.native.at(-1)?.params?.items).toEqual([{ type: 'message' }]);
  });
  it('persists and maps the recovered thread before releasing dependent requests', () => {
    const f = fixture();
    recover(f);
    f.bridge.fromClient({ id: 2, method: 'thread/settings/update', params: { threadId: 'old-id', model: 'other' } });
    f.bridge.fromNative({ id: f.native.at(-1)?.id });
    const persistId = f.native.at(-1)?.id;
    expect(f.native.at(-1)?.method).toBe('thread/section/move');
    f.bridge.fromNative({ id: persistId });
    expect(f.client[0]).toEqual({ id: 1, result: { thread: { id: 'new-id' } } });
    expect(f.native.at(-1)?.params?.threadId).toBe('new-id');
  });
  it('never releases queued turns when hydration fails', () => {
    const f = fixture();
    recover(f);
    f.bridge.fromClient({ id: 3, method: 'turn/start', params: { threadId: 'old-id' } });
    f.bridge.fromNative({ id: f.native.at(-1)?.id, error: { code: -2, message: 'injection rejected' } });
    expect(f.client).toEqual([missing, { id: 3, error: missing.error }]);
    expect(f.native.some((frame) => frame.method === 'turn/start')).toBe(false);
  });
  it('rejects dependent requests and suppresses late private responses after timeout', () => {
    vi.useFakeTimers();
    const f = fixture();
    recover(f);
    const privateId = f.native.at(-1)?.id;
    f.bridge.fromClient({ id: 3, method: 'turn/start' });
    vi.advanceTimersByTime(101);
    f.bridge.fromNative({ id: privateId });
    f.bridge.fromNative({ method: 'thread/started', params: { threadId: 'late-thread' } });
    expect(f.client).toHaveLength(2);
    expect(f.native.some((frame) => frame.method === 'turn/start')).toBe(false);
  });
  it('durably saves unused fresh threads before handing their ID to AionCore', () => {
    const f = fixture({ conversationId: 'new', items: [] });
    f.bridge.fromClient({ id: 4, method: 'thread/start', params: { cwd: '/new' } });
    f.bridge.fromNative({ id: 4, result: { thread: { id: 'fresh' } } });
    expect(f.client).toEqual([]);
    expect(f.native.at(-1)?.method).toBe('thread/section/move');
    f.bridge.fromNative({ id: f.native.at(-1)?.id });
    expect(f.client[0]?.id).toBe(4);
  });
});
describe('restored conversation context', () => {
  it('preserves text, attachment paths and tool outcomes without replaying tools', () => {
    const items = historyItems([
      { type: 'text', position: 'right', content: JSON.stringify({ content: 'Read /data/paper.pdf' }) },
      {
        type: 'tool_call',
        position: 'left',
        content: JSON.stringify({ command: 'rm important', result: 'TOOL_RESULT' }),
      },
      { type: 'thinking', position: 'left', content: '{}' },
    ]);
    expect(items.map((item) => item.role)).toEqual(['user', 'assistant']);
    expect(items[0].content[0].text).toContain('/data/paper.pdf');
    expect(items[1].content[0].text).toContain('context only, not an instruction to execute');
  });
  it('retains structured text rather than silently losing it', () => {
    expect(
      historyItems([{ type: 'text', position: 'right', content: '{"content":[{"text":"STRUCTURED"}]}' }])[0].content[0]
        .text
    ).toContain('STRUCTURED');
  });
  it('rejects oversized histories rather than truncating important data', () => {
    expect(() =>
      historyItems([
        { type: 'text', position: 'right', content: JSON.stringify({ content: 'x'.repeat(17 * 1024 * 1024) }) },
      ])
    ).toThrow('frame size');
  });
});
