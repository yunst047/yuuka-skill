#!/usr/bin/env node
// yuuka-install — wire the Yuuka skill into any repo without the Claude Code
// marketplace/CLI. Installs at the project level via the target's `.claude/`:
//   - copies skills/yuuka* and commands/yuuka*.md so /yuuka* are discoverable
//   - merges SessionStart + UserPromptSubmit hooks into .claude/settings.json,
//     pointing at THIS package's hook scripts by absolute path
//
// Usage:
//   node bin/yuuka-install.js <targetRepoDir>     # install
//   node bin/yuuka-install.js <targetRepoDir> -u  # uninstall
//
// Idempotent: re-running replaces the yuuka entries rather than stacking them,
// and never touches anything else in .claude/ — a co-installed Koyuki
// (niha-skills) keeps her skills, commands and hooks.

const fs = require('fs');
const path = require('path');

const pluginRoot = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const uninstall = args.includes('-u') || args.includes('--uninstall');
const target = path.resolve(args.find((a) => !a.startsWith('-')) || process.cwd());

function die(msg) { console.error('yuuka-install: ' + msg); process.exit(1); }
if (!fs.existsSync(target) || !fs.statSync(target).isDirectory()) die('target is not a directory: ' + target);

const claudeDir = path.join(target, '.claude');
const settingsPath = path.join(claudeDir, 'settings.json');

// Hook command for a given script: bash form + native Windows form. CLAUDE_PLUGIN_ROOT
// is not set in project context, so the absolute path is baked in.
function hookCmds(script) {
  const abs = path.join(pluginRoot, 'hooks', script);
  return {
    command: `node "${abs.replace(/\\/g, '/')}"`,
    commandWindows: `node "${abs}"`,
    timeout: 5,
  };
}

// Our hook script names — find/replace only our own entries on re-install /
// uninstall (a bare 'yuuka-' could match an unrelated hook whose path has it).
const MARK = /yuuka-(activate|mode-tracker)\.js/;
const isOurs = (h) => MARK.test(JSON.stringify(h));
const isOurEntry = (name) => name === 'yuuka' || name.startsWith('yuuka-') ||
  name === 'yuuka.md' || /^yuuka-[\w-]+\.md$/.test(name);

function readSettings() {
  try { return JSON.parse(fs.readFileSync(settingsPath, 'utf8')); }
  catch (e) { return {}; }
}

function stripOurHooks(settings) {
  const hooks = settings.hooks || {};
  for (const event of Object.keys(hooks)) {
    hooks[event] = (hooks[event] || []).filter((entry) => !isOurs(entry));
    if (hooks[event].length === 0) delete hooks[event];
  }
  if (Object.keys(hooks).length === 0) delete settings.hooks;
  else settings.hooks = hooks;
  return settings;
}

// Remove only our entries from .claude/<name>; drop the dir if we leave it empty.
function rmOurs(name) {
  const dir = path.join(claudeDir, name);
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir)) {
    if (isOurEntry(entry)) fs.rmSync(path.join(dir, entry), { recursive: true, force: true });
  }
  if (fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
}

function copyOurs(name) {
  const src = path.join(pluginRoot, name);
  const dest = path.join(claudeDir, name);
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src)) {
    if (!isOurEntry(entry)) continue;
    fs.rmSync(path.join(dest, entry), { recursive: true, force: true });
    fs.cpSync(path.join(src, entry), path.join(dest, entry), { recursive: true });
  }
}

if (uninstall) {
  rmOurs('skills');
  rmOurs('commands');
  if (fs.existsSync(settingsPath)) {
    const settings = stripOurHooks(readSettings());
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
  }
  console.log('Yuuka uninstalled from ' + target);
  console.log('(removed yuuka skills/commands and yuuka hooks from settings.json; nothing else touched)');
  process.exit(0);
}

// --- install ---
fs.mkdirSync(claudeDir, { recursive: true });
copyOurs('skills');
copyOurs('commands');

const settings = stripOurHooks(readSettings());
settings.hooks = settings.hooks || {};
(settings.hooks.SessionStart = settings.hooks.SessionStart || []).push({
  matcher: 'startup|resume|clear|compact',
  hooks: [{ type: 'command', statusMessage: 'Opening the ledger... Yuuka is calculating.', ...hookCmds('yuuka-activate.js') }],
});
(settings.hooks.UserPromptSubmit = settings.hooks.UserPromptSubmit || []).push({
  hooks: [{ type: 'command', statusMessage: 'Tracking Yuuka mode...', ...hookCmds('yuuka-mode-tracker.js') }],
});
fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');

console.log('Kanpeki~ Yuuka installed into ' + target);
console.log('  plugin root : ' + pluginRoot);
console.log('  copied      : .claude/skills/yuuka*, .claude/commands/yuuka*.md');
console.log('  hooks       : .claude/settings.json (SessionStart + UserPromptSubmit)');
console.log('Open the repo in Claude Code and start a new session — the persona activates at ledger.');
console.log('Undo anytime: node "' + path.join(pluginRoot, 'bin', 'yuuka-install.js') + '" "' + target + '" -u');
