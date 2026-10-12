import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { loadHistory } = require('../../../docker/agent-hub/codex/history.cjs') as {
  loadHistory: (options: { databasePath: string; workspace: string; threadId?: string }) => {
    conversationId: string;
    items: { content: { text: string }[] }[];
  } | null;
};
const directories: string[] = [];
afterEach(() => {
  directories.forEach((directory) => rmSync(directory, { recursive: true, force: true }));
  directories.length = 0;
});
function fixture(duplicate = false) {
  const directory = mkdtempSync(join(tmpdir(), 'studio-history-db-'));
  directories.push(directory);
  const databasePath = join(directory, 'aionui-backend.db');
  const db = new DatabaseSync(databasePath);
  db.exec(`CREATE TABLE conversations(id TEXT, extra TEXT);
    CREATE TABLE acp_session(conversation_id TEXT, session_id TEXT);
    CREATE TABLE messages(id TEXT, conversation_id TEXT, type TEXT, position TEXT, content TEXT, hidden INTEGER, created_at INTEGER);`);
  for (const id of duplicate ? ['mine', 'other'] : ['mine']) {
    db.prepare('INSERT INTO conversations VALUES (?,?)').run(
      id,
      JSON.stringify({ backend: 'codex', workspace: '/workspace' })
    );
    db.prepare('INSERT INTO acp_session VALUES (?,?)').run(id, 'anchor');
  }
  db.prepare('INSERT INTO messages VALUES (?,?,?,?,?,?,?)').run(
    'visible',
    'mine',
    'text',
    'right',
    '{"content":"USER_CONTEXT"}',
    0,
    1
  );
  db.prepare('INSERT INTO messages VALUES (?,?,?,?,?,?,?)').run(
    'hidden',
    'mine',
    'text',
    'right',
    '{"content":"HIDDEN_CONTEXT"}',
    1,
    2
  );
  db.close();
  return { databasePath, workspace: '/workspace', threadId: 'anchor' };
}
describe('Studio conversation identity for native recovery', () => {
  it('loads only visible messages of the matched conversation', () => {
    const history = loadHistory(fixture());
    expect(history?.conversationId).toBe('mine');
    expect(history?.items.map((item) => item.content[0].text)).toEqual(['USER_CONTEXT']);
  });
  it('does not take history from another anchor or workspace', () => {
    const options = fixture();
    expect(loadHistory({ ...options, threadId: 'different' })).toBeNull();
    expect(loadHistory({ ...options, workspace: '/other' })).toBeNull();
  });
  it('refuses ambiguous conversation identities instead of merging histories', () => {
    expect(() => loadHistory(fixture(true))).toThrow('Ambiguous');
  });
  it('surfaces unavailable database errors instead of recovering with empty history', () => {
    const options = fixture();
    rmSync(options.databasePath);
    expect(() => loadHistory(options)).toThrow();
  });
});
