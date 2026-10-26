const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { tmpDir, rm } = require('./helpers');
const config = require('../hooks/yuuka-config');

function withEnv(vars, fn) {
  const saved = {};
  for (const [k, v] of Object.entries(vars)) {
    saved[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try { return fn(); }
  finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

test('Yuuka aliases map onto engine modes', () => {
  assert.equal(config.normalizeMode('allowance'), 'lite');
  assert.equal(config.normalizeMode('ledger'), 'full');
  assert.equal(config.normalizeMode('deficit'), 'ultra');
  assert.equal(config.normalizeMode('  LEDGER '), 'full');
  assert.equal(config.normalizeMode('full'), 'full');
  assert.equal(config.normalizeMode('off'), 'off');
});

test('unknown or non-string modes normalize to null', () => {
  assert.equal(config.normalizeMode('nihaha'), null);
  assert.equal(config.normalizeMode(''), null);
  assert.equal(config.normalizeMode(undefined), null);
  assert.equal(config.normalizeMode(42), null);
});

test('audit and bench are config-valid but not runtime levels', () => {
  assert.equal(config.normalizeMode('audit'), null);
  assert.equal(config.normalizeConfigMode('audit'), 'audit');
  assert.equal(config.normalizeConfigMode('bench'), 'bench');
  assert.equal(config.normalizePersistedMode('bench'), 'bench');
  assert.equal(config.normalizePersistedMode('deficit'), 'ultra');
});

test('default mode is ledger (full) with no env or config', () => {
  const dir = tmpDir();
  try {
    withEnv({ YUUKA_DEFAULT_MODE: undefined, XDG_CONFIG_HOME: dir }, () => {
      assert.equal(config.DEFAULT_MODE, 'full');
      assert.equal(config.getDefaultMode(), 'full');
    });
  } finally { rm(dir); }
});

test('env var beats config file, config file beats default', () => {
  const dir = tmpDir();
  try {
    withEnv({ YUUKA_DEFAULT_MODE: undefined, XDG_CONFIG_HOME: dir }, () => {
      assert.equal(config.getConfigPath(), path.join(dir, 'yuuka', 'config.json'));
      assert.equal(config.writeDefaultMode('allowance'), 'lite');
      assert.deepEqual(JSON.parse(fs.readFileSync(config.getConfigPath(), 'utf8')), { defaultMode: 'lite' });
      assert.equal(config.getDefaultMode(), 'lite');

      process.env.YUUKA_DEFAULT_MODE = 'deficit';
      assert.equal(config.getDefaultMode(), 'ultra');

      process.env.YUUKA_DEFAULT_MODE = 'garbage';
      assert.equal(config.getDefaultMode(), 'lite');
    });
  } finally { rm(dir); }
});

test('writeDefaultMode rejects unknown modes without writing', () => {
  const dir = tmpDir();
  try {
    withEnv({ XDG_CONFIG_HOME: dir }, () => {
      assert.equal(config.writeDefaultMode('nope'), null);
      assert.equal(fs.existsSync(config.getConfigPath()), false);
    });
  } finally { rm(dir); }
});

test('CLAUDE_CONFIG_DIR overrides ~/.claude', () => {
  withEnv({ CLAUDE_CONFIG_DIR: '/x/claude' }, () => {
    assert.equal(config.getClaudeDir(), '/x/claude');
  });
});
