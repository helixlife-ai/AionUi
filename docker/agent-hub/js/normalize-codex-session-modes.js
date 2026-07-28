#!/usr/bin/env node
/**
 * Rewrite drifted Codex session mode ids in persisted SQLite data.
 *
 * Cron execution reads agent_config.mode from the DB (aioncore), so a
 * frontend-only normalize on create/save does not fix already-stored jobs.
 * Same for conversations.extra.session_mode / teams.session_mode.
 *
 * Env:
 *   AIONUI_DATA_DIR   DB dir (default /data)
 */
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const FROM = 'agent-full-access';
const TO = 'full-access';

const dataDir = process.env.AIONUI_DATA_DIR || '/data';
const dbPath = `${dataDir}/aionui-backend.db`;

if (!fs.existsSync(dbPath)) {
  process.exit(0);
}

const db = new DatabaseSync(dbPath);
db.exec('PRAGMA busy_timeout = 5000');

function tableExists(name) {
  const row = db.prepare(`SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name=?`).get(name);
  return Boolean(row);
}

function columnExists(table, column) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  return cols.some((c) => c.name === column);
}

let cronFixed = 0;
let convFixed = 0;
let teamFixed = 0;

try {
  if (tableExists('cron_jobs') && columnExists('cron_jobs', 'agent_config')) {
    const rows = db
      .prepare(
        `SELECT id, agent_config FROM cron_jobs
         WHERE agent_config IS NOT NULL AND instr(agent_config, ?) > 0`
      )
      .all(FROM);
    const update = db.prepare(`UPDATE cron_jobs SET agent_config = ?, updated_at = ? WHERE id = ?`);
    const now = Date.now();
    for (const row of rows) {
      let cfg;
      try {
        cfg = JSON.parse(row.agent_config);
      } catch {
        continue;
      }
      if (!cfg || typeof cfg !== 'object' || cfg.mode !== FROM) continue;
      cfg.mode = TO;
      update.run(JSON.stringify(cfg), now, row.id);
      cronFixed += 1;
    }
  }

  if (tableExists('conversations') && columnExists('conversations', 'extra')) {
    const rows = db
      .prepare(
        `SELECT id, extra FROM conversations
         WHERE extra IS NOT NULL AND instr(extra, ?) > 0`
      )
      .all(FROM);
    const update = db.prepare(`UPDATE conversations SET extra = ? WHERE id = ?`);
    for (const row of rows) {
      let extra;
      try {
        extra = JSON.parse(row.extra);
      } catch {
        continue;
      }
      if (!extra || typeof extra !== 'object' || extra.session_mode !== FROM) continue;
      extra.session_mode = TO;
      update.run(JSON.stringify(extra), row.id);
      convFixed += 1;
    }
  }

  if (tableExists('teams') && columnExists('teams', 'session_mode')) {
    const result = db.prepare(`UPDATE teams SET session_mode = ? WHERE session_mode = ?`).run(TO, FROM);
    teamFixed = Number(result.changes || 0);
  }

  if (cronFixed || convFixed || teamFixed) {
    console.log(
      `[agent-hub] normalized Codex mode ${FROM} → ${TO}: cron=${cronFixed} conversations=${convFixed} teams=${teamFixed}`
    );
  } else {
    console.log(`[agent-hub] Codex mode normalize: no ${FROM} rows to rewrite`);
  }
} finally {
  db.close();
}
