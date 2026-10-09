import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const image = process.argv[2] || 'agent-hub:v0.2.23-toB';
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-hub-image-smoke-'));
const name = `agent-hub-smoke-${Date.now()}`;
const docker = (...args) =>
  execFileSync('docker', args, { encoding: 'utf8', timeout: 120_000, maxBuffer: 8 * 1024 * 1024 }).trim();
const config = JSON.parse(
  execFileSync(
    'docker',
    [
      'compose',
      '-f',
      'aio_deploy/docker-compose.yaml',
      '-f',
      'docker/agent-hub/deployment/docker-compose-sandbox.yaml',
      'config',
      '--format',
      'json',
    ],
    {
      encoding: 'utf8',
      env: { ...process.env, SERIAL_NUMBER: 'smoke-device', APP_STORAGE_DIR: directory },
    }
  )
);
const service = config.services['agent-hub'];
const environment = {
  ...service.environment,
  ANTHROPIC_BASE_URL: 'http://127.0.0.1:19091',
  CODEX_BASE_URL: 'http://127.0.0.1:19091/v1',
  HAPPY_SERVER_URL: 'http://127.0.0.1:19091',
  OTEL_TRACES_EXPORTER: 'none',
  OTEL_EXPORTER_OTLP_ENDPOINT: '',
  CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
};
for (const volume of service.volumes) fs.mkdirSync(volume.source, { recursive: true });
// Exercise the pre-skills92 device-owned skill source.
const deviceSkill = path.join(directory, 'documents/data/openclaw/helixlife-skills/tob-fixture');
fs.mkdirSync(deviceSkill, { recursive: true });
fs.writeFileSync(
  path.join(deviceSkill, 'SKILL.md'),
  '---\nname: tob-fixture\ndescription: Local deployment fixture\n---\nRead-only fixture.\n'
);
// Python scientific packages have a separate startup installer; keep protocol smoke isolated.
fs.mkdirSync(path.join(directory, 'AgentHub/python-deps'), { recursive: true });
fs.writeFileSync(path.join(directory, 'AgentHub/python-deps/.deps-v1'), 'smoke fixture\n');
let base;
const start = () => {
  docker(
    'run',
    '-d',
    '--name',
    name,
    '--platform',
    'linux/arm64',
    '-p',
    '127.0.0.1::25808',
    '--user',
    service.user,
    ...(service.security_opt || []).flatMap((option) => {
      if (option.startsWith('seccomp=')) {
        return ['--security-opt', `seccomp=${path.resolve('aio_deploy', option.slice('seccomp='.length))}`];
      }
      return ['--security-opt', option];
    }),
    ...(service.tmpfs || []).flatMap((mount) => ['--tmpfs', mount]),
    '--workdir',
    service.working_dir,
    ...Object.entries(environment).flatMap(([key, value]) => ['-e', `${key}=${value}`]),
    ...service.volumes.flatMap(({ source, target, read_only }) => [
      '-v',
      `${source}:${target}${read_only ? ':ro' : ''}`,
    ]),
    '-v',
    `${path.resolve('docker/agent-hub/smoke')}:/smoke:ro`,
    '--entrypoint',
    '/bin/sh',
    image,
    '-c',
    `node /smoke/gateway.mjs &\n${service.command[0].replaceAll('$$', '$')}`
  );
  base = `http://${docker('port', name, '25808/tcp')}`;
};
const api = async (route, body) => {
  const response = await fetch(base + route, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.text();
  assert(response.ok, `${route}: HTTP ${response.status} ${raw.slice(0, 600)}`);
  const json = JSON.parse(raw);
  return json.data ?? json;
};
const ready = async () => {
  for (let i = 0; i < 120; i++) {
    try {
      await api('/api/settings/client');
      return;
    } catch {
      assert.equal(
        docker('inspect', name, '--format', '{{.State.Running}}'),
        'true',
        'Container exited before readiness'
      );
      await delay(1000);
    }
  }
  throw new Error('Backend did not become ready');
};
const sendTurn = async (conversation, model, runTool = false) => {
  const route = `/api/conversations/${conversation.id}`;
  const previous = await api(`${route}/messages?limit=100`);
  const count = (page) => (JSON.stringify(page).match(/SMOKE_OK_/g) || []).length;
  const before = count(previous);
  await api(`${route}/active-lease`, {});
  const accepted = await api(`${route}/messages`, {
    content: runTool
      ? 'SMOKE_RUN_TOOL: run the requested read-only command.'
      : 'Reply with a short plain-text greeting. Do not use tools.',
    files: [],
  });
  assert(accepted.msg_id && accepted.turn_id, 'Send must acknowledge the user message and turn');
  for (let i = 0; i < 90; i++) {
    await delay(1000);
    const messages = await api(`${route}/messages?limit=100`);
    if (count(messages) > before && JSON.stringify(messages).includes(`SMOKE_OK_${model}`)) {
      const detail = await api(route);
      if (detail.status === 'finished') {
        if (runTool)
          assert(
            messages.items.some(
              (message) =>
                message.type === 'tool_call' &&
                message.content.status === 'completed' &&
                String(message.content.output).includes('SMOKE_TOOL_OK')
            ),
            'Codex command must actually execute'
          );
        return;
      }
    }
  }
  throw new Error(`No completed model reply for ${model}`);
};
try {
  start();
  await ready();
  assert((await fetch(base)).ok, 'Static WebUI should be served');
  docker(
    'exec',
    name,
    'sh',
    '-c',
    'test ! -e /etc/agent-hub/builtin-skills-hub && test ! -e /etc/agent-hub/official-skills.tar.xz && test -L /data/builtin-skills-hub/tob-fixture && test -r /data/builtin-skills-hub/tob-fixture/SKILL.md && test "$(find /etc/agent-hub/auto-inject -name SKILL.md | wc -l)" -eq 6'
  );
  const builtin = JSON.parse(
    docker(
      'exec',
      name,
      'node',
      '--experimental-sqlite',
      '-e',
      `const {DatabaseSync}=require('node:sqlite'); const db=new DatabaseSync('/data/aionui-backend.db'); console.log(JSON.stringify(db.prepare("SELECT name FROM skills WHERE source='builtin'").all())); db.close();`
    )
  );
  assert(
    builtin.some((skill) => skill.name === 'tob-fixture'),
    'Device skill must be registered in the backend'
  );
  assert(builtin.length <= 7, 'The curated toC corpus must not appear in the backend catalog');
  console.log('PASS: toB device skill discovered; six system skills retained; toC corpus absent');
  const versionInfo = docker(
    'exec',
    name,
    'sh',
    '-c',
    'node --version && claude --version && codex --version && /app/aionui-web/aionui-web version'
  );
  assert(versionInfo.includes('2.1.236') && versionInfo.includes('0.151.0'), versionInfo);
  console.log(versionInfo);
  const sandboxProbe = docker(
    'exec',
    name,
    'codex',
    'sandbox',
    '--',
    '/bin/sh',
    '-c',
    'printf SANDBOX_OK; if touch /etc/agent-hub-smoke-denied; then rm /etc/agent-hub-smoke-denied; exit 1; fi'
  );
  assert(sandboxProbe.includes('SANDBOX_OK'), sandboxProbe);
  console.log('PASS: Codex sandbox executes commands and rejects writes outside its writable roots');
  const identity = await api('/api/identity');
  assert.equal(identity.sn, 'smoke-device');
  assert.equal(identity.fsRoot, '/agent_hub');
  const manifest = JSON.parse(
    docker('exec', name, 'cat', '/app/aionui-web/bundled-aioncore/linux-arm64/manifest.json')
  );
  assert.equal(manifest.version, 'v0.2.2');
  const assistants = await api('/api/assistants');
  fs.writeFileSync(path.join(directory, 'assistants.json'), JSON.stringify(assistants, null, 2));
  const conversations = [];
  for (const backend of ['claude', 'codex']) {
    const assistant = assistants.find((item) => item.enabled && item.agent?.acp_backend === backend);
    assert(assistant, `Installed ${backend} assistant should be detected`);
    const model = `agenthub-${backend}-deepseek-v4-1-flash`;
    const conversation = await api('/api/conversations', {
      name: `Image smoke ${backend}`,
      assistant: { id: assistant.id, conversation_overrides: { model, permission: 'default' } },
      extra: { workspace: '/agent_hub', custom_workspace: true },
    });
    await sendTurn(conversation, model);
    const page = await api(`/api/conversations/${conversation.id}/messages?limit=100`);
    assert(
      !page.items.some((message) => ['CLI_VERSION_NEWER', 'CLI_VERSION_OLDER'].includes(message.content?.code)),
      `${backend} should match the backend's verified version`
    );
    conversations.push({ conversation, model });
    console.log(`PASS: native ${backend} send and streamed response with ${model}`);
  }
  // Starting another CLI must not delete a live app-server's temporary helpers.
  docker('exec', name, 'codex', '--version');
  const codexConversation = conversations.find(({ model }) => model.includes('-codex-'));
  await sendTurn(codexConversation.conversation, codexConversation.model, true);
  console.log('PASS: Codex app-server executes a real command after another CLI process starts');
  fs.writeFileSync(path.join(directory, 'first-start.log'), docker('logs', name));
  docker('stop', '-t', '20', name);
  docker('rm', name);
  start();
  await ready();
  for (const { conversation, model } of conversations) await sendTurn(conversation, model);
  console.log(`PASS: container replacement resumes both conversations; fixtures: ${directory}`);
} catch (error) {
  try {
    fs.writeFileSync(path.join(directory, 'container.log'), docker('logs', name));
  } catch {}
  console.error(`Smoke failed; diagnostics: ${directory}`);
  throw error;
} finally {
  try {
    docker('rm', '-f', name);
  } catch {}
  // Keep only this test's isolated files for review; never touch appliance storage.
}
