const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { tmpDir, rm } = require('./helpers');
const { detectKoyuki } = require('../hooks/yuuka-detect');

function sandbox(fn) {
  const claudeDir = tmpDir();
  const cwd = tmpDir();
  try { return fn({ claudeDir, cwd }); }
  finally { rm(claudeDir); rm(cwd); }
}

function write(file, content = '') {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

test('no Koyuki anywhere -> not found', () => sandbox(({ claudeDir, cwd }) => {
  assert.deepEqual(detectKoyuki({ claudeDir, cwd }), { found: false, active: null, sources: [] });
}));

test('active Koyuki flag -> found with her current mode', () => sandbox(({ claudeDir, cwd }) => {
  write(path.join(claudeDir, '.koyuki-active'), 'ultra\n');
  const r = detectKoyuki({ claudeDir, cwd });
  assert.equal(r.found, true);
  assert.equal(r.active, 'ultra');
  assert.ok(r.sources.includes('flag'));
}));

test('installed_plugins.json mentioning koyuki -> found, not active', () => sandbox(({ claudeDir, cwd }) => {
  write(path.join(claudeDir, 'plugins', 'installed_plugins.json'),
    JSON.stringify({ plugins: { 'koyuki@koyuki': [{ scope: 'user' }] } }));
  const r = detectKoyuki({ claudeDir, cwd });
  assert.equal(r.found, true);
  assert.equal(r.active, null);
  assert.ok(r.sources.includes('installed_plugins'));
}));

test('marketplace / plugin cache dirs -> found', () => sandbox(({ claudeDir, cwd }) => {
  fs.mkdirSync(path.join(claudeDir, 'plugins', 'cache', 'koyuki', 'koyuki'), { recursive: true });
  const r = detectKoyuki({ claudeDir, cwd });
  assert.equal(r.found, true);
  assert.ok(r.sources.includes('plugin_cache'));
}));

test('project-level koyuki-install skill -> found', () => sandbox(({ claudeDir, cwd }) => {
  write(path.join(cwd, '.claude', 'skills', 'koyuki', 'SKILL.md'), '---\nname: koyuki\n---\n');
  const r = detectKoyuki({ claudeDir, cwd });
  assert.equal(r.found, true);
  assert.ok(r.sources.includes('project_skill'));
}));

test('user-level koyuki skill -> found', () => sandbox(({ claudeDir, cwd }) => {
  write(path.join(claudeDir, 'skills', 'koyuki', 'SKILL.md'), '---\nname: koyuki\n---\n');
  assert.ok(detectKoyuki({ claudeDir, cwd }).sources.includes('user_skill'));
}));

test('unrelated plugins and corrupt json do not count', () => sandbox(({ claudeDir, cwd }) => {
  write(path.join(claudeDir, 'plugins', 'installed_plugins.json'), '{ not json');
  write(path.join(claudeDir, 'plugins', 'known_marketplaces.json'), JSON.stringify({ ponytail: {} }));
  fs.mkdirSync(path.join(claudeDir, 'plugins', 'cache', 'ponytail'), { recursive: true });
  assert.equal(detectKoyuki({ claudeDir, cwd }).found, false);
}));

test('empty koyuki flag still counts as installed, but not active', () => sandbox(({ claudeDir, cwd }) => {
  write(path.join(claudeDir, '.koyuki-active'), '');
  const r = detectKoyuki({ claudeDir, cwd });
  assert.equal(r.found, true);
  assert.equal(r.active, null);
}));
