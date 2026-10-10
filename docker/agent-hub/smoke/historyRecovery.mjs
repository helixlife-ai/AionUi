import assert from 'node:assert/strict';

const MARKER = 'STUDIO_RECOVERED_HISTORY_42';
const MISSING_THREAD = '00000000-0000-4000-8000-000000000024';

/** Seed only the runner's disposable SQLite database with a missing native anchor. */
export function seedMissingThread(docker, name, conversationId) {
  docker(
    'exec',
    name,
    'node',
    '--experimental-sqlite',
    '-e',
    `
    const {DatabaseSync}=require('node:sqlite');
    const db=new DatabaseSync('/data/aionui-backend.db');
    const row=db.prepare("SELECT * FROM messages WHERE conversation_id=? AND type='text' AND position='right' LIMIT 1").get(${JSON.stringify(conversationId)});
    if(!row)throw new Error('Missing smoke message');
    const body=JSON.parse(row.content);body.content+=' ${MARKER} /data/recovery-paper.pdf';
    db.prepare('UPDATE messages SET content=? WHERE id=?').run(JSON.stringify(body),row.id);
    db.prepare('UPDATE acp_session SET session_id=? WHERE conversation_id=?').run(${JSON.stringify(MISSING_THREAD)},${JSON.stringify(conversationId)});
    db.close();
  `
  );
}

/** Require native confirmation and prove that the next model request has older context. */
export async function verifyRecovery({ docker, name, api, base, conversation, sendTurn, model }) {
  const route = `/api/conversations/${conversation.id}`;
  const before = await api(`${route}/messages?limit=100`);
  await api(`${route}/runtime/ensure`, {});
  const response = await fetch(base + `${route}/config-options/model`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value: model }),
  });
  const result = await response.json();
  assert(response.ok, `Missing-history model switch: ${JSON.stringify(result)}`);
  assert.equal((result.data ?? result).confirmation, 'observed');
  const after = await api(`${route}/messages?limit=100`);
  assert.deepEqual(after.items, before.items, 'Recovery must preserve Studio messages');
  await sendTurn(conversation, model);
  const requests = JSON.parse(
    docker(
      'exec',
      name,
      'node',
      '-e',
      "fetch('http://127.0.0.1:19091/__smoke/requests').then(r=>r.text()).then(console.log)"
    )
  );
  const last = requests.findLast((request) => request.path.includes('/responses'));
  assert(JSON.stringify(last.input).includes(MARKER), 'Actual next model request must include historical user data');
  assert(
    JSON.stringify(last.input).includes('/data/recovery-paper.pdf'),
    'Historical attachment paths must be retained'
  );
  assert.equal(last.model, model);
  console.log('PASS: missing Codex thread restores history, preserves Studio messages and confirms model switches');
}

/** A thread opened for model selection must survive restart before any model turn. */
export async function verifyUnusedThread({ docker, name, api, base, conversation, expectedAnchor }) {
  const route = `/api/conversations/${conversation.id}`;
  await api(`${route}/runtime/ensure`, {});
  const response = await fetch(base + `${route}/config-options/model`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value: 'agenthub-codex-qwen3-7-plus' }),
  });
  const result = await response.json();
  assert(response.ok, `Unused thread switch: ${JSON.stringify(result)}`);
  assert.equal((result.data ?? result).confirmation, 'observed');
  const page = await api(`${route}/messages?limit=100`);
  assert(!page.items.some((message) => message.type === 'text'), 'Persistence must not require a model turn');
  const anchor = docker(
    'exec',
    name,
    'node',
    '--experimental-sqlite',
    '-e',
    `
    const {DatabaseSync}=require('node:sqlite');const fs=require('node:fs');const path=require('node:path');
    const db=new DatabaseSync('/data/aionui-backend.db',{readOnly:true});
    const id=db.prepare('SELECT session_id FROM acp_session WHERE conversation_id=?').get(${JSON.stringify(conversation.id)}).session_id;db.close();
    function files(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(dir,e.name)):[path.join(dir,e.name)]);}
    if(!files('/root/.codex/sessions').some(file=>file.includes(id)))throw new Error('Unused thread is not durable');
    console.log(id);
  `
  );
  if (expectedAnchor) assert.equal(anchor, expectedAnchor, 'Unused thread must resume with its original native ID');
  console.log(
    `PASS: unused Codex thread ${expectedAnchor ? 'resumes after container replacement' : 'persists without a first message'}`
  );
  return anchor;
}
