/**
 * Shared helpers for marking Codex project paths as trusted in config.toml.
 * Both the boot/periodic sweep and the PATH spawn wrapper must use this so
 * concurrent read-modify-write updates do not drop each other's entries.
 */
const fs = require('fs');
const path = require('path');

function sleepMs(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    // busy-wait; keep this module free of child_process for tiny image scripts
  }
}

function withConfigLock(configPath, fn) {
  const lockPath = `${configPath}.lock`;
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    let fd;
    try {
      fd = fs.openSync(lockPath, 'wx');
    } catch (err) {
      if (err && err.code === 'EEXIST') {
        sleepMs(20);
        continue;
      }
      return fn();
    }
    try {
      return fn();
    } finally {
      try {
        fs.closeSync(fd);
      } catch {
        // ignore
      }
      try {
        fs.unlinkSync(lockPath);
      } catch {
        // ignore
      }
    }
  }
  return fn();
}

function normalizeProjectPaths(projectPaths) {
  const out = [];
  const seen = new Set();
  for (const raw of projectPaths) {
    if (!raw || typeof raw !== 'string') continue;
    let projectPath = path.resolve(raw);
    // Codex may complain about the nested `.codex` folder; trust the workspace root.
    if (path.basename(projectPath) === '.codex') {
      projectPath = path.dirname(projectPath);
    }
    if (seen.has(projectPath)) continue;
    seen.add(projectPath);
    out.push(projectPath);
  }
  return out;
}

/**
 * Ensure each project path has a trusted `[projects."…"]` block.
 * Returns the number of newly added entries.
 */
function ensureTrustedProjects(configPath, projectPaths) {
  const paths = normalizeProjectPaths(projectPaths);
  if (paths.length === 0) return 0;

  return withConfigLock(configPath, () => {
    let cfg = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf8') : '';
    let added = 0;
    for (const projectPath of paths) {
      const key = `[projects."${projectPath}"]`;
      if (cfg.includes(key)) continue;
      cfg += `\n${key}\ntrust_level = "trusted"\n`;
      added += 1;
    }
    if (added > 0) {
      const tmp = `${configPath}.tmp.${process.pid}`;
      fs.writeFileSync(tmp, cfg);
      fs.renameSync(tmp, configPath);
    }
    return added;
  });
}

module.exports = {
  ensureTrustedProjects,
  normalizeProjectPaths,
  withConfigLock,
};
