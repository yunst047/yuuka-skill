const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { ROOT, tmpDir, rm, isolatedEnv, runHook, readFlag } = require('./helpers');

function sandbox(fn) {
  const claudeDir = tmpDir();
  const cwd = tmpDir();
  try { return fn({ claudeDir, cwd }); }
  finally { rm(claudeDir); rm(cwd); }
}

const prompt = (p) => JSON.stringify({ prompt: p });

// --- SessionStart activation -------------------------------------------------

test('activate: default ledger ruleset, flag written, statusline nudge', () => sandbox(({ claudeDir, cwd }) => {
  const r = runHook('yuuka-activate.js', { claudeDir, cwd });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.stdout.startsWith('YUUKA MODE ACTIVE — level: ledger (full)'));
  assert.match(r.stdout, /STATUSLINE SETUP NEEDED/);
  assert.match(r.stdout, /yuuka-statusline/);
  assert.doesNotMatch(r.stdout, /CO-OP WITH KOYUKI/);
  assert.equal(readFlag(claudeDir), 'full');
}));

test('activate: YUUKA_DEFAULT_MODE=deficit emits the deficit row only', () => sandbox(({ claudeDir, cwd }) => {
  const r = runHook('yuuka-activate.js', { claudeDir, cwd, env: { YUUKA_DEFAULT_MODE: 'deficit' } });
  assert.match(r.stdout, /level: deficit \(ultra\)/);
  assert.match(r.stdout, /\| \*\*deficit\*\* \|/);
  assert.doesNotMatch(r.stdout, /\| \*\*ledger\*\* \|/);
  assert.equal(readFlag(claudeDir), 'ultra');
}));

test('activate: off mode writes no flag and no rules', () => sandbox(({ claudeDir, cwd }) => {
  fs.writeFileSync(path.join(claudeDir, '.yuuka-active'), 'full');
  const r = runHook('yuuka-activate.js', { claudeDir, cwd, env: { YUUKA_DEFAULT_MODE: 'off' } });
  assert.equal(r.stdout, 'OK');
  assert.equal(readFlag(claudeDir), null);
}));

test('activate: existing statusLine suppresses the nudge', () => sandbox(({ claudeDir, cwd }) => {
  fs.writeFileSync(path.join(claudeDir, 'settings.json'),
    JSON.stringify({ statusLine: { type: 'command', command: 'x' } }));
  const r = runHook('yuuka-activate.js', { claudeDir, cwd });
  assert.doesNotMatch(r.stdout, /STATUSLINE SETUP NEEDED/);
}));

test('activate: Koyuki flag on the machine adds the co-op block', () => sandbox(({ claudeDir, cwd }) => {
  fs.writeFileSync(path.join(claudeDir, '.koyuki-active'), 'full');
  const r = runHook('yuuka-activate.js', { claudeDir, cwd });
  assert.match(r.stdout, /CO-OP WITH KOYUKI/);
  assert.match(r.stdout, /nihaha/);
}));

test('activate: project-level Koyuki install adds the co-op block', () => sandbox(({ claudeDir, cwd }) => {
  fs.mkdirSync(path.join(cwd, '.claude', 'skills', 'koyuki'), { recursive: true });
  const r = runHook('yuuka-activate.js', { claudeDir, cwd });
  assert.match(r.stdout, /CO-OP WITH KOYUKI/);
}));

// --- UserPromptSubmit mode tracker -------------------------------------------

test('tracker: /yuuka <alias> switches level', () => sandbox(({ claudeDir }) => {
  const r = runHook('yuuka-mode-tracker.js', { claudeDir, input: prompt('/yuuka allowance') });
  assert.equal(readFlag(claudeDir), 'lite');
  assert.match(r.stdout, /YUUKA MODE CHANGED — level: allowance/);

  runHook('yuuka-mode-tracker.js', { claudeDir, input: prompt('/yuuka deficit') });
  assert.equal(readFlag(claudeDir), 'ultra');
}));

test('tracker: bare /yuuka uses the default level', () => sandbox(({ claudeDir }) => {
  runHook('yuuka-mode-tracker.js', { claudeDir, input: prompt('/yuuka') });
  assert.equal(readFlag(claudeDir), 'full');
}));

test('tracker: /yuuka-bench and /yuuka-audit are independent modes', () => sandbox(({ claudeDir }) => {
  runHook('yuuka-mode-tracker.js', { claudeDir, input: prompt('/yuuka-bench parse() under 2ms') });
  assert.equal(readFlag(claudeDir), 'bench');
  runHook('yuuka-mode-tracker.js', { claudeDir, input: prompt('/yuuka:yuuka-audit src/') });
  assert.equal(readFlag(claudeDir), 'audit');
}));

test('tracker: one-shot commands leave the level alone', () => sandbox(({ claudeDir }) => {
  fs.writeFileSync(path.join(claudeDir, '.yuuka-active'), 'lite');
  for (const p of ['/yuuka-help', '/yuuka-alloc foo.go', '/yuuka-pass', 'just a normal prompt']) {
    runHook('yuuka-mode-tracker.js', { claudeDir, input: prompt(p) });
    assert.equal(readFlag(claudeDir), 'lite', p);
  }
}));

test('tracker: /yuuka off, "stop yuuka" and "normal mode" deactivate', () => sandbox(({ claudeDir }) => {
  for (const p of ['/yuuka off', 'ok please stop yuuka now', 'back to Normal Mode']) {
    fs.writeFileSync(path.join(claudeDir, '.yuuka-active'), 'full');
    const r = runHook('yuuka-mode-tracker.js', { claudeDir, input: prompt(p) });
    assert.equal(readFlag(claudeDir), null, p);
    assert.match(r.stdout, /YUUKA MODE OFF/);
  }
}));

test('tracker: survives a BOM and garbage input', () => sandbox(({ claudeDir }) => {
  runHook('yuuka-mode-tracker.js', { claudeDir, input: '﻿' + prompt('/yuuka ledger') });
  assert.equal(readFlag(claudeDir), 'full');

  const r = runHook('yuuka-mode-tracker.js', { claudeDir, input: '{ not json' });
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '');
}));

test('codex host: JSON hook output with a system badge', () => sandbox(({ claudeDir }) => {
  const r = runHook('yuuka-mode-tracker.js', {
    claudeDir, input: prompt('/yuuka deficit'), env: { PLUGIN_DATA: claudeDir },
  });
  const out = JSON.parse(r.stdout);
  assert.equal(out.systemMessage, 'YUUKA:ULTRA');
  assert.equal(out.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
}));

// --- statusline ----------------------------------------------------------------

function statusline(claudeDir) {
  if (process.platform === 'win32') {
    return spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File',
      path.join(ROOT, 'hooks', 'yuuka-statusline.ps1')],
    { env: isolatedEnv(claudeDir), encoding: 'utf8' }).stdout.trim();
  }
  return spawnSync('bash', [path.join(ROOT, 'hooks', 'yuuka-statusline.sh')],
    { env: isolatedEnv(claudeDir), encoding: 'utf8' }).stdout.trim();
}

test('statusline: solo, combined with Koyuki, and empty', () => sandbox(({ claudeDir }) => {
  assert.equal(statusline(claudeDir), '');

  fs.writeFileSync(path.join(claudeDir, '.yuuka-active'), 'full');
  assert.equal(statusline(claudeDir), '[YUUKA:LEDGER]');

  fs.writeFileSync(path.join(claudeDir, '.koyuki-active'), 'full');
  assert.equal(statusline(claudeDir), '[YUUKA:LEDGER|KOYUKI:NIHAHA]');

  fs.writeFileSync(path.join(claudeDir, '.yuuka-active'), 'bench');
  fs.writeFileSync(path.join(claudeDir, '.koyuki-active'), 'ultra');
  assert.equal(statusline(claudeDir), '[YUUKA:BENCH|KOYUKI:NIHAHAHACK]');

  fs.unlinkSync(path.join(claudeDir, '.yuuka-active'));
  assert.equal(statusline(claudeDir), '[KOYUKI:NIHAHAHACK]');
}));
