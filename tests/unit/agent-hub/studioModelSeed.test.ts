import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import models from '@/renderer/components/agent/StudioModelSelector/models.json';

const temporary: string[] = [];
afterEach(() => temporary.splice(0).forEach((dir) => fs.rmSync(dir, { recursive: true, force: true })));

function fixture(settings = '{}') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-model-seed-'));
  temporary.push(dir);
  fs.cpSync('docker/agent-hub/models', dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'models.json'), JSON.stringify(models));
  const claude = path.join(dir, 'settings.json');
  const codex = path.join(dir, 'codex.json');
  fs.writeFileSync(claude, settings);
  return {
    claude,
    codex,
    run: () =>
      execFileSync(
        process.execPath,
        [path.join(dir, 'seed.js'), claude, codex, path.resolve('docker/agent-hub/codex-model-catalog.json')],
        { stdio: 'pipe' }
      ),
  };
}

describe('Studio deployment model catalogs', () => {
  it('pins the bundled Claude binary too, without touching other managed agents', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-pin-claude-'));
    temporary.push(dir);
    const target = path.join(dir, 'managed-resources/cli/claude/old/linux-arm64/claude');
    const other = path.join(dir, 'codex');
    const source = path.join(dir, 'pinned');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, 'old');
    fs.writeFileSync(other, 'codex');
    fs.writeFileSync(source, 'pinned');
    execFileSync(process.execPath, ['docker/agent-hub/models/pinClaude.js', dir, source]);
    expect(fs.readFileSync(target, 'utf8')).toBe('pinned');
    expect(fs.readFileSync(other, 'utf8')).toBe('codex');
  });
  it('fails the image build when the bundled CLI layout changes', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-pin-missing-'));
    temporary.push(dir);
    const source = path.join(dir, 'pinned');
    fs.writeFileSync(source, 'pinned');
    expect(() =>
      execFileSync(process.execPath, ['docker/agent-hub/models/pinClaude.js', dir, source], { stdio: 'pipe' })
    ).toThrow();
  });
  it('seeds exact Claude IDs while preserving unrelated settings', () => {
    const f = fixture(JSON.stringify({ permissions: { allow: ['Read'] }, model: 'legacy-model' }));
    f.run();
    const settings = JSON.parse(fs.readFileSync(f.claude, 'utf8'));
    expect(settings.modelPicker.options.map((row: { model: string }) => row.model)).toEqual(
      models.map((model) => model.claude)
    );
    expect(settings.permissions).toEqual({ allow: ['Read'] });
    expect(settings.model).toBe('legacy-model');
  });
  it('seeds all confirmed Codex IDs and keeps required schema fields', () => {
    const f = fixture();
    f.run();
    const catalog = JSON.parse(fs.readFileSync(f.codex, 'utf8'));
    expect(catalog.models.map((row: { slug: string }) => row.slug)).toEqual(
      models.filter((model) => model.codex).map((model) => model.codex)
    );
    const template = JSON.parse(fs.readFileSync('docker/agent-hub/codex-model-catalog.json', 'utf8')).models[0];
    expect(catalog.models[0]).toMatchObject({
      ...template,
      slug: 'agenthub-qwen3-5-plus',
      display_name: 'Qwen3.5-Plus',
      priority: 0,
    });
  });
  it('uses only Codex reasoning levels accepted by GLM-5.3', () => {
    const f = fixture();
    f.run();
    const catalog = JSON.parse(fs.readFileSync(f.codex, 'utf8'));
    const glm = catalog.models.find((row: { slug: string }) => row.slug === 'agenthub-glm-5-3');

    expect(glm.default_reasoning_level).toBe('high');
    expect(glm.supported_reasoning_levels.map((row: { effort: string }) => row.effort)).toEqual(['low', 'high', 'max']);
  });
  it('is idempotent', () => {
    const f = fixture();
    f.run();
    const before = [fs.readFileSync(f.claude, 'utf8'), fs.readFileSync(f.codex, 'utf8')];
    f.run();
    expect([fs.readFileSync(f.claude, 'utf8'), fs.readFileSync(f.codex, 'utf8')]).toEqual(before);
  });
  it('fails without overwriting malformed user settings or creating a partial Codex catalog', () => {
    const f = fixture('{invalid');
    expect(f.run).toThrow();
    expect(fs.readFileSync(f.claude, 'utf8')).toBe('{invalid');
    expect(fs.existsSync(f.codex)).toBe(false);
  });
});
