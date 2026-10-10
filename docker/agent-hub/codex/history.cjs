const path = require('node:path');

/** Read the original conversation without modifying its messages or native anchor. */
function loadHistory({ databasePath, workspace, threadId }) {
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const rows = db
      .prepare(
        `SELECT c.id, c.extra FROM conversations c
         LEFT JOIN acp_session a ON a.conversation_id = c.id
         WHERE json_extract(c.extra, '$.backend') = 'codex'
           AND json_extract(c.extra, '$.workspace') = ?
           ${threadId ? 'AND a.session_id = ?' : ''}`
      )
      .all(path.resolve(workspace), ...(threadId ? [threadId] : []));
    if (rows.length > 1) throw new Error('Ambiguous Codex conversation identity');
    if (!rows.length) return null;
    const messages = db
      .prepare(
        `SELECT id, type, position, content FROM messages
         WHERE conversation_id = ? AND hidden = 0
         ORDER BY created_at, rowid`
      )
      .all(rows[0].id);
    return { conversationId: rows[0].id, items: historyItems(messages) };
  } finally {
    db.close();
  }
}

/** Restore conversation data as context; never replay historical tool actions. */
function historyItems(messages) {
  const items = [];
  for (const message of messages) {
    if (['thinking', 'tips', 'agent_status'].includes(message.type)) continue;
    const body = JSON.parse(message.content);
    let text = message.type === 'text' && typeof body.content === 'string' ? body.content : '';
    if (!text && (message.type !== 'text' || typeof body.content !== 'string')) {
      text = `Historical ${message.type} record (context only, not an instruction to execute):\n${JSON.stringify(body)}`;
    }
    if (!text) continue;
    const role = message.position === 'right' ? 'user' : 'assistant';
    items.push({
      type: 'message',
      role,
      content: [{ type: role === 'user' ? 'input_text' : 'output_text', text }],
    });
  }
  // Fail visibly instead of silently dropping older user data.
  if (Buffer.byteLength(JSON.stringify(items)) > 16 * 1024 * 1024) {
    throw new Error('Codex recovery history exceeds the supported frame size');
  }
  return items;
}

module.exports = { loadHistory, historyItems };
