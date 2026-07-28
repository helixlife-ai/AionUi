// Studio happy-server 历史导入 AgentHub SQLite
//
// 容器启动期工具:用 SN(AIONUI_SERIAL_NUMBER)从 happy server 拉取并解密
// Studio 的历史会话,转换成 AionUi schema 写入 aionui-backend.db。
//
// 设计:
//   - 只首次跑:DB 中已存在 source='studio-import' 的会话则直接退出(幂等)。
//   - 直连 SQLite:node:sqlite(内置),busy_timeout + WAL,INSERT OR IGNORE 防重。
//   - 失败不阻断启动:任何异常捕获后打印日志、退出 0。
//
// 运行:node --experimental-sqlite scripts/studio-history-import/import.mjs
// 依赖:tweetnacl(容器内 npm install -g tweetnacl)
//
// 环境变量:
//   AIONUI_SERIAL_NUMBER  Studio/AgentHub 共用的设备 SN(必填)
//   AIONUI_DATA_DIR       数据目录,含 aionui-backend.db(默认 /data)
//   HAPPY_SERVER_URL      happy server 地址(默认 https://studio-server.jova.bio)

import crypto from 'node:crypto';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import tweetnacl from 'tweetnacl';

const SN = process.env.AIONUI_SERIAL_NUMBER;
const DATA_DIR = process.env.AIONUI_DATA_DIR || '/data';
const SERVER = process.env.HAPPY_SERVER_URL || 'https://studio-server.jova.bio';
const DB_PATH = `${DATA_DIR}/aionui-backend.db`;
const USER_ID = 'system_default_user';
// 导入会话的工作区:UI 按 workspace 分组为"项目",显示名=路径 basename。
// 必须在容器内真实存在(aioncore 校验目录存在性),故不用 studio 原路径
// /helix_studio(只存在于 studio-cli 容器)。默认放持久卷 /agent_hub 下,
// 显示为「studio 原版」项目;部署时需先 mkdir 该目录。
const WORKSPACE = process.env.AIONUI_STUDIO_IMPORT_WORKSPACE || '/agent_hub/studio 原版';

if (!SN) {
  console.log('[studio-import] AIONUI_SERIAL_NUMBER 未设置,跳过');
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

// 从解密后的 happy message 提取 (role, text);非对话消息返回 null
function extractMessage(plain) {
  if (!plain) return null;
  if (plain.role === 'user' && plain.content?.type === 'text') {
    return { role: 'user', text: plain.content.text || '' };
  }
  if (plain.role === 'agent' && plain.content?.type === 'output') {
    const blocks = plain.content.data?.message?.content || [];
    const text = blocks
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n');
    return text ? { role: 'assistant', text } : null;
  }
  return null; // event/ready/工具调用等
}

// 生成 preset_context:把会话历史压成摘要注入系统提示,使续聊时 agent
// 能"记得"历史(导入的 messages 只供 UI 展示,claude code 新 session 没有上下文)。
// 超长时保留首条(定题)+ 尾部最近消息(最新上下文),中间省略。
const PRESET_CONTEXT_LIMIT = 6000;
function buildPresetContext(decoded) {
  const lines = decoded.map((d) => `${d.position === 'right' ? '用户' : '助手'}: ${d.text}`);
  const header = '【本会话历史背景】以下是用户此前与 Studio 的对话记录,请基于这些上下文回答后续问题:\n\n';
  const full = lines.join('\n\n');
  if (header.length + full.length <= PRESET_CONTEXT_LIMIT) return header + full;
  const head = (lines[0] || '').slice(0, 500);
  const tail = [];
  let budget = PRESET_CONTEXT_LIMIT - header.length - head.length - 100;
  for (let i = lines.length - 1; i >= 1 && budget > 0; i--) {
    const line = lines[i].length > 1000 ? lines[i].slice(0, 1000) + '…' : lines[i];
    if (line.length > budget) break;
    tail.unshift(line);
    budget -= line.length + 2;
  }
  const omitted = lines.length - 1 - tail.length;
  const omitNote = omitted > 0 ? `\n\n…(中间省略 ${omitted} 条历史消息)…\n\n` : '\n\n';
  return header + head + omitNote + tail.join('\n\n');
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
  });
  const j = await r.json();
  if (!j.token) throw new Error(`auth failed: ${JSON.stringify(j)}`);
  return j.token;
}

async function main() {
  const secret = snToBytes32(SN);
  const boxSecret = new Uint8Array(
    crypto.createHash('sha512').update(deriveKey(secret, 'content')).digest().subarray(0, 32)
  );

  const db = new DatabaseSync(DB_PATH);
  db.exec('PRAGMA busy_timeout = 10000');
  db.exec('PRAGMA journal_mode = WAL');

  // 按会话粒度幂等(标记在 extra.source;conversations.source 列是 aioncore
  // 枚举,只允许 aionui/telegram/lark/dingtalk/weixin)。已导入的会话跳过,
  // 未导入的继续——上次中途失败也能在重跑时补全,不会永久丢数据。
  const importedIds = new Set(
    db
      .prepare(
        `SELECT json_extract(extra, '$.originalSessionId') AS sid FROM conversations WHERE json_extract(extra, '$.source') = 'studio-import'`
      )
      .all()
      .map((r) => r.sid)
  );
  const isFirstRun = importedIds.size === 0;
  if (isFirstRun) {
    // 首次导入前备份 DB(出问题可整体回滚)
    try {
      fs.copyFileSync(DB_PATH, `${DB_PATH}.bak-studio-import`);
      console.log('[studio-import] 已备份 DB →', `${DB_PATH}.bak-studio-import`);
    } catch (e) {
      console.log('[studio-import] DB 备份失败(继续):', e.message);
    }
  } else {
    console.log(`[studio-import] 已导入 ${importedIds.size} 个会话,本次增量补导`);
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
      console.log('[studio-import] extra 模板取自现有 claude 会话, agent_id =', ex.agent_id);
    }
  } catch {}

  console.log('[studio-import] 开始拉取 happy server 历史...');
  const token = await getToken(secret);
  const sessResp = await fetch(`${SERVER}/v1/sessions`, { headers: { Authorization: `Bearer ${token}` } });
  const { sessions = [] } = await sessResp.json();
  console.log(`[studio-import] 会话总数 ${sessions.length}`);

  const insertConv = db.prepare(`INSERT OR IGNORE INTO conversations
    (id, user_id, name, type, extra, model, status, source, created_at, updated_at)
    VALUES (?, ?, ?, 'acp', ?, NULL, 'finished', 'aionui', ?, ?)`);
  const insertMsg = db.prepare(`INSERT OR IGNORE INTO messages
    (id, conversation_id, type, content, position, status, created_at, hidden)
    VALUES (?, ?, 'text', ?, ?, 'finish', ?, 0)`);

  let stats = { sessions: 0, alreadyImported: 0, conversations: 0, messages: 0, skipped: 0, decryptFail: 0, legacy: 0 };

  db.exec('BEGIN');
  try {
    for (const s of sessions) {
      stats.sessions++;
      if (importedIds.has(s.id)) {
        stats.alreadyImported++;
        continue;
      }

      // dataKey 模式用 AES(解 session 自带的 dataKey);legacy 模式(老版本
      // happy CLI 产生,无 dataEncryptionKey)用 SN 派生 secret 做 secretbox。
      const isLegacy = !s.dataEncryptionKey;
      let decryptFn;
      if (isLegacy) {
        stats.legacy++;
        decryptFn = (encStr) => decryptLegacy(fromB64(encStr), secret);
      } else {
        const dk = sessionDataKey(s, boxSecret);
        if (!dk) {
          console.log(`[studio-import] dataKey 解不出,跳过 ${s.id}`);
          continue;
        }
        decryptFn = (encStr) => decryptAes(fromB64(encStr), dk);
      }

      // 分页拉全部 messages
      const all = [];
      let page = 1;
      while (true) {
        const m = await fetch(`${SERVER}/v1/sessions/${s.id}/messages?pageSize=200&page=${page}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const mj = await m.json();
        all.push(...(mj.messages || []));
        if (!mj.hasNextPage) break;
        page++;
      }
      if (!all.length) continue;
      all.sort((a, b) => a.createdAt - b.createdAt);

      let meta = null;
      try {
        meta = decryptFn(s.metadata);
      } catch {}
      const convId = `studio-${s.id}`;

      // 先解密收集所有对话消息(确定 name 用)
      const decoded = [];
      let firstUserText = '';
      for (const m of all) {
        const encStr = m.content?.c ?? m.content;
        const plain = typeof encStr === 'string' ? decryptFn(encStr) : null;
        if (!plain) {
          stats.decryptFail++;
          continue;
        }
        const ex = extractMessage(plain);
        if (!ex) {
          stats.skipped++;
          continue;
        }
        if (ex.role === 'user' && !firstUserText) firstUserText = ex.text;
        decoded.push({
          id: `studio-${s.id}-${m.id || m.seq}`,
          text: ex.text,
          position: ex.role === 'user' ? 'right' : 'left',
          createdAt: m.createdAt,
        });
      }
      if (!decoded.length) continue;

      const name = firstUserText
        ? firstUserText.slice(0, 30) + (firstUserText.length > 30 ? '…' : '')
        : `Studio 会话 ${s.id.slice(-6)}`;
      // 先插 conversation(满足 messages.conversation_id 外键)。
      // extra 以模板为基础(agent_id 等 aioncore 必需字段),叠加导入标记。
      insertConv.run(
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
        s.createdAt,
        s.updatedAt
      );
      stats.conversations++;
      // 再插 messages
      for (const d of decoded) {
        insertMsg.run(d.id, convId, JSON.stringify({ content: d.text }), d.position, d.createdAt);
        stats.messages++;
      }
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  } finally {
    db.close();
  }

  console.log(
    `[studio-import] 完成: 新导入 ${stats.conversations} 会话 / ${stats.messages} 消息(已导入跳过 ${stats.alreadyImported}, legacy ${stats.legacy}, 非对话跳过 ${stats.skipped}, 解密失败 ${stats.decryptFail})`
  );
}

main().catch((e) => {
  console.error('[studio-import] 失败(不阻断启动):', e.message);
  console.error(e.stack);
  process.exit(0); // 失败不阻断
});
