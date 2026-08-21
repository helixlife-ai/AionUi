import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';

// @ts-expect-error Runtime-tested JavaScript module used by the container importer.
import { loadImportedSessionIds, withSavepoint } from '../../scripts/studio-history-import/database-utils.mjs';
// @ts-expect-error Runtime-tested JavaScript module used by the container importer.
import { buildPresetContext, extractMessage } from '../../scripts/studio-history-import/message-utils.mjs';

const wrapAgentContent = (content: unknown) => ({
  role: 'agent',
  content: { type: 'output', data: { message: { content } } },
});

describe('Studio history message compatibility', () => {
  it('extracts assistant text from array, object and string legacy shapes', () => {
    expect(extractMessage(wrapAgentContent([{ type: 'text', text: 'array text' }]))).toEqual({
      role: 'assistant',
      text: 'array text',
    });
    expect(extractMessage(wrapAgentContent({ type: 'text', text: 'object text' }))).toEqual({
      role: 'assistant',
      text: 'object text',
    });
    expect(extractMessage(wrapAgentContent('string text'))).toEqual({ role: 'assistant', text: 'string text' });
  });

  it('skips unknown message shapes without throwing', () => {
    expect(
      extractMessage({ role: 'agent', content: { type: 'output', data: { message: { content: 42 } } } })
    ).toBeNull();
    expect(extractMessage({ role: 'event' })).toBeNull();
    expect(extractMessage(null)).toBeNull();
  });

  it('builds context locally and truncates oversized history', () => {
    const context = buildPresetContext([
      { position: 'right', text: 'first question' },
      ...Array.from({ length: 20 }, (_, index) => ({ position: 'left', text: `${index}-${'x'.repeat(900)}` })),
    ]);

    expect(context).toContain('用户: first question');
    expect(context).toContain('中间省略');
    expect(context.length).toBeLessThanOrEqual(6000);
  });
});

describe('Studio history session isolation and idempotency', () => {
  const databases: DatabaseSync[] = [];

  afterEach(() => {
    for (const database of databases.splice(0)) database.close();
  });

  it('rolls back only the failed session and allows the next session to commit', () => {
    const database = new DatabaseSync(':memory:');
    databases.push(database);
    database.exec('CREATE TABLE imported_sessions (id TEXT PRIMARY KEY)');

    expect(() =>
      withSavepoint(database, () => {
        database.prepare('INSERT INTO imported_sessions VALUES (?)').run('broken-session');
        throw new Error('bad legacy payload');
      })
    ).toThrow('bad legacy payload');

    withSavepoint(database, () => {
      database.prepare('INSERT INTO imported_sessions VALUES (?)').run('valid-session');
    });

    expect(database.prepare('SELECT id FROM imported_sessions').all()).toEqual([{ id: 'valid-session' }]);
  });

  it('loads only successfully committed Studio session ids on restart', () => {
    const database = new DatabaseSync(':memory:');
    databases.push(database);
    database.exec('CREATE TABLE conversations (id TEXT PRIMARY KEY, extra TEXT)');
    database
      .prepare('INSERT INTO conversations VALUES (?, ?)')
      .run('studio-valid', JSON.stringify({ source: 'studio-import', originalSessionId: 'valid-session' }));
    database
      .prepare('INSERT INTO conversations VALUES (?, ?)')
      .run('native', JSON.stringify({ source: 'aionui', originalSessionId: 'native-session' }));

    expect(loadImportedSessionIds(database)).toEqual(new Set(['valid-session']));
  });
});
