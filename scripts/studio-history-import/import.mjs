// Studio happy-server 历史导入 AgentHub SQLite
//
// 容器启动期工具:用 SN(AIONUI_SERIAL_NUMBER)从 happy server 拉取并解密
// Studio 的历史会话,转换成 AionUi schema 写入 aionui-backend.db。
//
// 设计:
//   - 按 originalSessionId 增量幂等,成功会话在后续启动中直接跳过。
//   - 单条坏消息跳过;单个坏会话独立回滚,不影响其他会话。
//   - 失败不阻断启动:记录可定位日志后退出 0。
//
// 运行:node --experimental-sqlite scripts/studio-history-import/import.mjs
// 依赖:tweetnacl(容器内 npm install -g tweetnacl)
//
// 环境变量:
//   AIONUI_SERIAL_NUMBER  Studio/AgentHub 共用的设备 SN(必填)
//   AIONUI_DATA_DIR       数据目录,含 aionui-backend.db(默认 /data)
//   HAPPY_SERVER_URL      happy server 地址(默认 https://studio-server.newidea.pro)

import crypto from 'node:crypto';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import tweetnacl from 'tweetnacl';
import { loadImportedSessionIds, withSavepoint } from './database-utils.mjs';
import { buildPresetContext, extractMessage } from './message-utils.mjs';

const SN = process.env.AIONUI_SERIAL_NUMBER;
const DATA_DIR = process.env.AIONUI_DATA_DIR || '/data';
const SERVER = process.env.HAPPY_SERVER_URL || 'https://studio-server.newidea.pro';
const DB_PATH = `${DATA_DIR}/aionui-backend.db`;
const USER_ID = 'system_default_user';
const REQUEST_TIMEOUT_MS = 15000;
// 导入会话的工作区:UI 按 workspace 分组为"项目",显示名=路径 basename。
// 必须在容器内真实存在(aioncore 校验目录存在性),故不用 studio 原路径
// /helix_studio(只存在于 studio-cli 容器)。默认放持久卷 /agent_hub 下,
// 显示为「studio 原版」项目;部署时需先 mkdir 该目录。
const WORKSPACE = process.env.AIONUI_STUDIO_IMPORT_WORKSPACE || '/agent_hub/studio 原版';

const timestamp = () => new Date().toISOString();
const log = (...args) => console.log(`[studio-import] ${timestamp()}`, ...args);
const warn = (...args) => console.warn(`[studio-import] ${timestamp()} WARN`, ...args);
const error = (...args) => console.error(`[studio-import] ${timestamp()} ERROR`, ...args);

if (!SN) {
  log('AIONUI_SERIAL_NUMBER 未设置,跳过');
  process.exit(0);
}

// ---- SN → 密钥派生(与 helix-studio CLI/client 一致) ----
function snToBytes32(sn) {
  const parts = sn.split('-');
  if (parts.length !== 3) throw new Error(`Invalid SN format: ${sn}`);
  const [prefix, base64Content, suffix] = parts;
  const bin = atob(base64Content);
  const contentBytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) contentBytes[i] = bin.charCodeAt(i);
  const prefixBytes = new TextEncoder().encode(prefix);
  const suffixBytes = new TextEncoder().encode(suffix);
  const result = new Uint8Array(32);
  let offset = 0;
  result[offset++] = prefixBytes.length;
  result.set(prefixBytes, offset);
  offset += prefixBytes.length;
  result[offset++] = contentBytes.length;
  result.set(contentBytes, offset);
  offset += contentBytes.length;
  result.set(suffixBytes, 32 - suffixBytes.length - 1);
  result[31] = suffixBytes.length;
  return result;
}

// BIP32 式 HMAC-SHA512 密钥树派生(deriveKey)
function deriveKey(seed, path) {
  const root = crypto.createHmac('sha512', 'Happy EnCoder Master Seed').update(seed).digest();
  const chainCode = root.subarray(32, 64);
  const childData = Buffer.concat([Buffer.from([0]), Buffer.from(path, 'utf8')]);
  const child = crypto.createHmac('sha512', chainCode).update(childData).digest();
  return new Uint8Array(child.subarray(0, 32));
}

const fromB64 = (s) => new Uint8Array(Buffer.from(s, 'base64'));
const toB64 = (u8) => Buffer.from(u8).toString('base64');

// AES-256-GCM 解密(CLI encryptWithDataKey 格式:version(1,=0)+nonce(12)+ct+authTag(16))
function decryptAes(bundle, dataKey) {
  if (bundle.length < 1 || bundle[0] !== 0) return null;
  const nonce = bundle.subarray(1, 13);
  const authTag = bundle.subarray(bundle.length - 16);
  const ct = bundle.subarray(13, bundle.length - 16);
  try {
    const d = crypto.createDecipheriv('aes-256-gcm', dataKey, nonce);
    d.setAuthTag(Buffer.from(authTag));
    return JSON.parse(new TextDecoder().decode(Buffer.concat([d.update(Buffer.from(ct)), d.final()])));
  } catch {
    return null;
  }
}

// 用 box 私钥解 session 的 dataEncryptionKey → 32B AES dataKey
function sessionDataKey(session, boxSecret) {
  const dek = fromB64(session.dataEncryptionKey);
  // 格式: version(0) + ephemeralPub(32) + nonce(24) + ct
  return tweetnacl.box.open(dek.subarray(57), dek.subarray(33, 57), dek.subarray(1, 33), boxSecret);
}

// legacy 模式解密(tweetnacl secretbox,密钥 = SN 派生的 32B secret;
// 旧版 happy CLI 产生的会话没有 dataEncryptionKey,属于此类)
function decryptLegacy(data, secret) {
  const nonce = data.subarray(0, tweetnacl.secretbox.nonceLength);
  const enc = data.subarray(tweetnacl.secretbox.nonceLength);
  const d = tweetnacl.secretbox.open(enc, nonce, secret);
  return d ? JSON.parse(new TextDecoder().decode(d)) : null;
}

async function getToken(secret) {
  const kp = tweetnacl.sign.keyPair.fromSeed(secret);
  const challenge = crypto.randomBytes(32);
  const signature = tweetnacl.sign.detached(challenge, kp.secretKey);
  const r = await fetch(`${SERVER}/v1/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      publicKey: toB64(kp.publicKey),
      challenge: toB64(challenge),
      signature: toB64(signature),
      snCode: SN,
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!r.ok) throw new Error(`auth request failed: HTTP ${r.status}`);
  const j = await r.json();
  if (!j.token) throw new Error(`auth failed: ${JSON.stringify(j)}`);
  return j.token;
}

async function main() {
  const secret = snToBytes32(SN);
  const boxSecret = new Uint8Array(
    crypto.createHash('sha512').update(deriveKey(secret, 'content')).digest().subarray(0, 32)
  );

  // Finish global authentication/listing before opening the local database.
  // A server outage must not touch the DB or its pre-import backup.
  log('开始拉取 happy server 历史...', SERVER);
  const token = await getToken(secret);
  const sessResp = await fetch(`${SERVER}/v1/sessions`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!sessResp.ok) throw new Error(`sessions request failed: HTTP ${sessResp.status}`);
  const { sessions = [] } = await sessResp.json();
  if (!Array.isArray(sessions)) throw new Error('sessions response malformed: sessions is not an array');
  log(`会话总数 ${sessions.length}`);

  const db = new DatabaseSync(DB_PATH);
  db.exec('PRAGMA busy_timeout = 10000');
  db.exec('PRAGMA journal_mode = WAL');

  // 按会话粒度幂等(标记在 extra.source;conversations.source 列是 aioncore
  // 枚举,只允许 aionui/telegram/lark/dingtalk/weixin)。已导入的会话跳过,
  // 未导入的继续——上次中途失败也能在重跑时补全,不会永久丢数据。
  const importedIds = loadImportedSessionIds(db);
  const isFirstRun = importedIds.size === 0;
  if (isFirstRun) {
    // Preserve the first pre-import snapshot; retries must never overwrite it.
    const backupPath = `${DB_PATH}.bak-studio-import`;
    try {
      if (fs.existsSync(backupPath)) {
        log('首次导入备份已存在,保留原文件 →', backupPath);
      } else {
        const escapedPath = backupPath.replaceAll("'", "''");
        db.exec(`VACUUM INTO '${escapedPath}'`);
        log('已创建一致性 DB 备份 →', backupPath);
      }
    } catch (e) {
      warn('DB 备份失败(继续):', e.message);
    }
  } else {
    log(`已导入 ${importedIds.size} 个会话,本次增量补导`);
  }

  // 从现有 claude acp 会话提取 extra 模板(agent_id 等 aioncore 反序列化必需字段)。
  // 全新机器没有现有会话时用内置默认值。
  let extraTemplate = {
    agent_id: '2d23ff1c',
    agent_source: 'builtin',
    backend: 'claude',
    current_mode_id: 'default',
    default_files: [],
    mcp_server_ids: [],
    mcp_servers: [],
    mcp_statuses: [],
    session_mcp_servers: [],
    session_mode: 'default',
    skills: [],
  };
  try {
    const row = db
      .prepare(
        `SELECT extra FROM conversations WHERE type = 'acp' AND json_extract(extra, '$.backend') = 'claude' LIMIT 1`
      )
      .get();
    if (row) {
      const ex = JSON.parse(row.extra);
      extraTemplate = { ...extraTemplate, ...ex };
      log('extra 模板取自现有 claude 会话, agent_id =', ex.agent_id);
    }
  } catch {}

  const insertConv = db.prepare(`INSERT OR IGNORE INTO conversations
    (id, user_id, name, type, extra, model, status, source, created_at, updated_at)
    VALUES (?, ?, ?, 'acp', ?, NULL, 'finished', 'aionui', ?, ?)`);
  const insertMsg = db.prepare(`INSERT OR IGNORE INTO messages
    (id, conversation_id, type, content, position, status, created_at, hidden)
    VALUES (?, ?, 'text', ?, ?, 'finish', ?, 0)`);

  const stats = {
    sessions: 0,
    alreadyImported: 0,
    conversations: 0,
    messages: 0,
    emptySessions: 0,
    skippedMessages: 0,
    decryptFail: 0,
    sessionFailures: 0,
    legacy: 0,
  };

  try {
    for (const s of sessions) {
      stats.sessions++;
      try {
        if (!s?.id || typeof s.id !== 'string') throw new Error('session id missing');
        if (importedIds.has(s.id)) {
          stats.alreadyImported++;
          continue;
        }

        // dataKey sessions use AES; legacy sessions use the SN-derived secretbox key.
        const isLegacy = !s.dataEncryptionKey;
        let decryptFn;
        if (isLegacy) {
          stats.legacy++;
          decryptFn = (encrypted) => decryptLegacy(fromB64(encrypted), secret);
        } else {
          const dataKey = sessionDataKey(s, boxSecret);
          if (!dataKey) throw new Error('data encryption key cannot be decrypted');
          decryptFn = (encrypted) => decryptAes(fromB64(encrypted), dataKey);
        }

        const all = [];
        let page = 1;
        while (true) {
          const response = await fetch(`${SERVER}/v1/sessions/${s.id}/messages?pageSize=200&page=${page}`, {
            headers: { Authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          });
          if (!response.ok) throw new Error(`messages page ${page} failed: HTTP ${response.status}`);
          const payload = await response.json();
          const pageMessages = payload.messages ?? [];
          if (!Array.isArray(pageMessages)) throw new Error(`messages page ${page} malformed`);
          all.push(...pageMessages);
          if (!payload.hasNextPage) break;
          page++;
        }
        if (!all.length) {
          stats.emptySessions++;
          continue;
        }
        all.sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0));

        let meta = null;
        try {
          if (typeof s.metadata === 'string') meta = decryptFn(s.metadata);
        } catch {
          warn(`session=${s.id} metadata 解密失败,继续导入消息`);
        }

        const decoded = [];
        let firstUserText = '';
        for (const [messageIndex, message] of all.entries()) {
          try {
            const encrypted = message?.content?.c ?? message?.content;
            const plain = typeof encrypted === 'string' ? decryptFn(encrypted) : null;
            if (!plain) {
              stats.decryptFail++;
              continue;
            }
            const extracted = extractMessage(plain);
            if (!extracted) {
              stats.skippedMessages++;
              continue;
            }
            if (extracted.role === 'user' && !firstUserText) firstUserText = extracted.text;
            decoded.push({
              id: `studio-${s.id}-${message.id || message.seq || messageIndex}`,
              text: extracted.text,
              position: extracted.role === 'user' ? 'right' : 'left',
              createdAt: Number(message.createdAt || s.createdAt || Date.now()),
            });
          } catch (messageError) {
            stats.skippedMessages++;
            warn(
              `session=${s.id} message=${message?.id || message?.seq || 'unknown'} 解析失败,已跳过:`,
              messageError.message
            );
          }
        }
        if (!decoded.length) {
          stats.emptySessions++;
          log(`session=${s.id} 无有效对话消息,已跳过`);
          continue;
        }

        const convId = `studio-${s.id}`;
        const name = firstUserText
          ? firstUserText.slice(0, 30) + (firstUserText.length > 30 ? '…' : '')
          : `Studio 会话 ${s.id.slice(-6)}`;

        withSavepoint(db, () => {
          const insertResult = insertConv.run(
            convId,
            USER_ID,
            name,
            JSON.stringify({
              ...extraTemplate,
              workspace: WORKSPACE,
              custom_workspace: true,
              preset_context: buildPresetContext(decoded),
              source: 'studio-import',
              originalSessionId: s.id,
              flavor: meta?.flavor || 'claude',
            }),
            Number(s.createdAt || Date.now()),
            Number(s.updatedAt || s.createdAt || Date.now())
          );
          if (insertResult.changes !== 1) throw new Error(`conversation id conflict: ${convId}`);
          for (const item of decoded) {
            insertMsg.run(item.id, convId, JSON.stringify({ content: item.text }), item.position, item.createdAt);
          }
        });

        importedIds.add(s.id);
        stats.conversations++;
        stats.messages += decoded.length;
      } catch (sessionError) {
        stats.sessionFailures++;
        warn(`session=${s?.id || 'unknown'} 导入失败,本会话已跳过且将在下次启动重试:`, sessionError.message);
      }
    }
  } finally {
    db.close();
  }

  log(
    `完成: 新导入 ${stats.conversations} 会话 / ${stats.messages} 消息` +
      `(已导入跳过 ${stats.alreadyImported}, 空会话 ${stats.emptySessions}, 会话失败 ${stats.sessionFailures}, ` +
      `消息跳过 ${stats.skippedMessages}, 解密失败 ${stats.decryptFail}, legacy ${stats.legacy})`
  );
}

main().catch((mainError) => {
  error('导入失败(不阻断启动):', mainError.message);
  if (mainError.stack) console.error(mainError.stack);
  process.exit(0);
});
