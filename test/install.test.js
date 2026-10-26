const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { ROOT, tmpDir, rm } = require('./helpers');

const INSTALLER = path.join(ROOT, 'bin', 'yuuka-install.js');

function install(target, ...flags) {
  return spawnSync(process.execPath, [INSTALLER, target, ...flags], { encoding: 'utf8' });
}

function settings(target) {
  return JSON.parse(fs.readFileSync(path.join(target, '.claude', 'settings.json'), 'utf8'));
}

test('installer: copies skills/commands and wires both hooks', () => {
  const target = tmpDir();
  try {
    const r = install(target);
    assert.equal(r.status, 0, r.stderr);
    assert.ok(fs.existsSync(path.join(target, '.claude', 'skills', 'yuuka', 'SKILL.md')));
    assert.ok(fs.existsSync(path.join(target, '.claude', 'skills', 'yuuka', 'references', 'go.md')));
    assert.ok(fs.existsSync(path.join(target, '.claude', 'commands', 'yuuka-bench.md')));

    const s = settings(target);
    assert.equal(s.hooks.SessionStart.length, 1);
    assert.equal(s.hooks.UserPromptSubmit.length, 1);
    assert.match(s.hooks.SessionStart[0].hooks[0].command, /yuuka-activate\.js/);
    assert.match(s.hooks.UserPromptSubmit[0].hooks[0].command, /yuuka-mode-tracker\.js/);
  } finally { rm(target); }
});

test('installer: idempotent and never clobbers unrelated settings', () => {
  const target = tmpDir();
  try {
    fs.mkdirSync(path.join(target, '.claude'));
    const theirs = { type: 'command', command: 'echo theirs' };
    fs.writeFileSync(path.join(target, '.claude', 'settings.json'), JSON.stringify({
      model: 'opus',
      hooks: { SessionStart: [{ hooks: [theirs] }] },
    }));

    install(target);
    install(target);
    const s = settings(target);
    assert.equal(s.model, 'opus');
    assert.equal(s.hooks.SessionStart.length, 2);
    assert.deepEqual(s.hooks.SessionStart[0].hooks[0], theirs);
    assert.equal(s.hooks.UserPromptSubmit.length, 1);
  } finally { rm(target); }
});

test('installer: uninstall removes only what it added', () => {
  const target = tmpDir();
  try {
    fs.mkdirSync(path.join(target, '.claude'));
    fs.writeFileSync(path.join(target, '.claude', 'settings.json'), JSON.stringify({ model: 'opus' }));
    install(target);
    const r = install(target, '-u');
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(settings(target), { model: 'opus' });
    assert.equal(fs.existsSync(path.join(target, '.claude', 'skills', 'yuuka')), false);
    assert.equal(fs.existsSync(path.join(target, '.claude', 'commands', 'yuuka.md')), false);
  } finally { rm(target); }
});

test('installer: leaves a co-installed Koyuki untouched', () => {
  const target = tmpDir();
  try {
    const koyukiSkill = path.join(target, '.claude', 'skills', 'koyuki', 'SKILL.md');
    const koyukiCmd = path.join(target, '.claude', 'commands', 'koyuki.md');
    fs.mkdirSync(path.dirname(koyukiSkill), { recursive: true });
    fs.mkdirSync(path.dirname(koyukiCmd), { recursive: true });
    fs.writeFileSync(koyukiSkill, 'koyuki');
    fs.writeFileSync(koyukiCmd, 'koyuki');
    const koyukiHook = { hooks: [{ type: 'command', command: 'node "/x/hooks/koyuki-activate.js"' }] };
    fs.writeFileSync(path.join(target, '.claude', 'settings.json'),
      JSON.stringify({ hooks: { SessionStart: [koyukiHook] } }));

    install(target);
    assert.equal(fs.readFileSync(koyukiSkill, 'utf8'), 'koyuki');
    assert.equal(settings(target).hooks.SessionStart.length, 2);

    install(target, '-u');
    assert.equal(fs.readFileSync(koyukiSkill, 'utf8'), 'koyuki');
    assert.equal(fs.readFileSync(koyukiCmd, 'utf8'), 'koyuki');
    assert.deepEqual(settings(target).hooks.SessionStart, [koyukiHook]);
  } finally { rm(target); }
});

test('installer: rejects a missing target dir', () => {
  const r = install(path.join(ROOT, 'does-not-exist-' + Date.now()));
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /not a directory/);
});
