import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';

const SCRIPT = path.resolve(process.cwd(), 'docker/agent-hub/js/clean-stale-builtin-skills.js');
const tempDirs: string[] = [];

function makeDataDir(): string {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clean-builtin-skills-'));
  tempDirs.push(dataDir);
  const db = new DatabaseSync(path.join(dataDir, 'aionui-backend.db'));
  db.exec('CREATE TABLE skills (id TEXT PRIMARY KEY, name TEXT NOT NULL, source TEXT NOT NULL)');
  db.close();
  return dataDir;
}

function insertSkill(dataDir: string, id: string, name: string, source: string): void {
  const db = new DatabaseSync(path.join(dataDir, 'aionui-backend.db'));
  db.prepare('INSERT INTO skills (id, name, source) VALUES (?, ?, ?)').run(id, name, source);
  db.close();
}

function skillNames(dataDir: string, source: string): string[] {
  const db = new DatabaseSync(path.join(dataDir, 'aionui-backend.db'));
  const rows = db.prepare('SELECT name FROM skills WHERE source = ? ORDER BY name').all(source) as Array<{
    name: string;
  }>;
  db.close();
  return rows.map((row) => row.name);
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('clean-stale-builtin-skills', () => {
  it('removes stale builtin state without deleting custom skills', () => {
    const dataDir = makeDataDir();
    const hubDir = path.join(dataDir, 'image-builtin-skills-hub');
    fs.mkdirSync(path.join(hubDir, 'new-official'), { recursive: true });
    fs.writeFileSync(path.join(hubDir, 'new-official', 'SKILL.md'), '---\nname: new-official\n---\n');
    fs.mkdirSync(path.join(dataDir, 'builtin-skills'), { recursive: true });
    fs.mkdirSync(path.join(dataDir, 'builtin-skills-hub'), { recursive: true });
    fs.mkdirSync(path.join(dataDir, 'skills', 'my-skill'), { recursive: true });
    fs.writeFileSync(path.join(dataDir, 'skills', 'my-skill', 'SKILL.md'), 'user skill');
    insertSkill(dataDir, 'old', 'old-official', 'builtin');
    insertSkill(dataDir, 'new', 'new-official', 'builtin');
    insertSkill(dataDir, 'mine', 'my-skill', 'custom');

    execFileSync(process.execPath, ['--experimental-sqlite', SCRIPT], {
      env: { ...process.env, AIONUI_BUILTIN_SKILLS_PATH: hubDir, AIONUI_DATA_DIR: dataDir },
    });

    expect(skillNames(dataDir, 'builtin')).toEqual(['new-official']);
    expect(skillNames(dataDir, 'custom')).toEqual(['my-skill']);
    expect([
      fs.existsSync(path.join(dataDir, 'builtin-skills')),
      fs.existsSync(path.join(dataDir, 'builtin-skills-hub')),
    ]).toEqual([false, false]);
  });

  it('never removes the user-owned My Skills directory', () => {
    const dataDir = makeDataDir();
    const hubDir = path.join(dataDir, 'image-builtin-skills-hub');
    fs.mkdirSync(path.join(hubDir, 'new-official'), { recursive: true });
    fs.writeFileSync(path.join(hubDir, 'new-official', 'SKILL.md'), '---\nname: new-official\n---\n');
    fs.mkdirSync(path.join(dataDir, 'builtin-skills-hub'), { recursive: true });
    fs.mkdirSync(path.join(dataDir, 'skills', 'my-skill'), { recursive: true });
    fs.writeFileSync(path.join(dataDir, 'skills', 'my-skill', 'SKILL.md'), 'user skill');

    execFileSync(process.execPath, ['--experimental-sqlite', SCRIPT], {
      env: { ...process.env, AIONUI_BUILTIN_SKILLS_PATH: hubDir, AIONUI_DATA_DIR: dataDir },
    });

    expect(fs.readFileSync(path.join(dataDir, 'skills', 'my-skill', 'SKILL.md'), 'utf8')).toBe('user skill');
  });

  it('does nothing when the builtin redirect is not configured', () => {
    const dataDir = makeDataDir();
    fs.mkdirSync(path.join(dataDir, 'builtin-skills'), { recursive: true });
    insertSkill(dataDir, 'old', 'old-official', 'builtin');

    execFileSync(process.execPath, ['--experimental-sqlite', SCRIPT], {
      env: { ...process.env, AIONUI_BUILTIN_SKILLS_PATH: '', AIONUI_DATA_DIR: dataDir },
    });

    expect(skillNames(dataDir, 'builtin')).toEqual(['old-official']);
    expect(fs.existsSync(path.join(dataDir, 'builtin-skills'))).toBe(true);
  });
});
