// Shared test helpers — temp dirs and hook spawning with an isolated env, so
// no test ever touches the real ~/.claude or ~/.config.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

function tmpDir(prefix = 'yuuka-test-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function rm(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

// Env with every variable the hooks read pointed at sandbox dirs.
function isolatedEnv(claudeDir, extra = {}) {
  const env = { ...process.env };
  for (const key of ['PLUGIN_DATA', 'COPILOT_PLUGIN_DATA', 'YUUKA_DEFAULT_MODE']) delete env[key];
  env.CLAUDE_CONFIG_DIR = claudeDir;
  env.XDG_CONFIG_HOME = path.join(claudeDir, 'xdg');
  return { ...env, ...extra };
}

function runHook(script, { claudeDir, cwd, input = '', env = {} }) {
  const res = spawnSync(process.execPath, [path.join(ROOT, 'hooks', script)], {
    cwd: cwd || claudeDir,
    env: isolatedEnv(claudeDir, env),
    input,
    encoding: 'utf8',
  });
  return { stdout: res.stdout, stderr: res.stderr, status: res.status };
}

function readFlag(claudeDir, name = '.yuuka-active') {
  try { return fs.readFileSync(path.join(claudeDir, name), 'utf8').trim(); }
  catch (e) { return null; }
}

module.exports = { ROOT, tmpDir, rm, isolatedEnv, runHook, readFlag };
