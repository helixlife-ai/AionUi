#!/usr/bin/env node
/**
 * Clear ACP resume anchors after the agent has been idle long enough that the
 * CLI process is likely already gone.
 *
 * Why: aioncore kills idle ACP CLIs (default ~5 min) but leaves
 * acp_session.session_id in SQLite. Channel (Feishu/Lark) warmup then does
 * session/load → "Agent resource not found" → "Message send failed: ACP error".
 * Switching agent works because it forces a new session; clearing the anchor
 * achieves the same without user action.
 *
 * Chat history is untouched — only the resume sid is dropped so the next
 * message uses session/new.
 *
 * Env:
 *   AIONUI_DATA_DIR                  DB dir (default /data)
 *   ACP_IDLE_ANCHOR_CLEAR_MINUTES    age threshold (default 10)
 */
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const dataDir = process.env.AIONUI_DATA_DIR || '/data';
const dbPath = `${dataDir}/aionui-backend.db`;
const idleMinutes = Math.max(1, Number(process.env.ACP_IDLE_ANCHOR_CLEAR_MINUTES || 10) || 10);

if (!fs.existsSync(dbPath)) {
  process.exit(0);
}

const cutoffMs = Date.now() - idleMinutes * 60 * 1000;
const db = new DatabaseSync(dbPath);
db.exec('PRAGMA busy_timeout = 5000');

try {
  const result = db
    .prepare(
      `UPDATE acp_session
       SET session_id = NULL
       WHERE session_id IS NOT NULL
         AND length(session_id) > 0
         AND (
           last_active_at IS NULL
           OR last_active_at < ?
         )`
    )
    .run(cutoffMs);

  if (result.changes > 0) {
    console.log(
      `[agent-hub] cleared idle ACP session anchors: changes=${result.changes} older_than_min=${idleMinutes}`
    );
  }
} finally {
  db.close();
}
