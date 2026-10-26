// Content lint — the skill files are the product, so their shape is tested too.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { ROOT } = require('./helpers');

const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

function frontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  const fm = {};
  let key = null;
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([\w-]+):\s*(.*)$/);
    if (kv) { key = kv[1]; fm[key] = kv[2].replace(/^>\s*$/, ''); }
    else if (key && /^\s+\S/.test(line)) fm[key] = (fm[key] + ' ' + line.trim()).trim();
  }
  return fm;
}

const SKILLS = ['yuuka', 'yuuka-audit', 'yuuka-alloc', 'yuuka-bench', 'yuuka-pass'];
const COMMANDS = ['yuuka', 'yuuka-audit', 'yuuka-alloc', 'yuuka-bench', 'yuuka-pass', 'yuuka-help'];
const LANGS = ['go', 'rust', 'c-cpp', 'java-kotlin', 'csharp', 'python', 'js-ts', 'swift', 'zig'];
const SECTIONS = [
  '## Containers & pre-allocation',
  '## Letter vs number',
  '## Length checks',
  '## Pass by role',
  '## Tests (TDD + alloc asserts)',
  '## Benchmarks',
  '## Copy-and-destroy anti-patterns',
];

test('every skill has name == folder and a real description', () => {
  const dirs = fs.readdirSync(path.join(ROOT, 'skills')).sort();
  assert.deepEqual(dirs, [...SKILLS].sort());
  for (const s of SKILLS) {
    const fm = frontmatter(read('skills', s, 'SKILL.md'));
    assert.ok(fm, s + ' has frontmatter');
    assert.equal(fm.name, s);
    assert.ok(fm.description && fm.description.length > 80, s + ' description');
    assert.ok(fm.description.length <= 1024, s + ' description <= 1024 chars');
  }
});

test('every command has a description', () => {
  const files = fs.readdirSync(path.join(ROOT, 'commands')).sort();
  assert.deepEqual(files, COMMANDS.map((c) => c + '.md').sort());
  for (const c of COMMANDS) {
    const fm = frontmatter(read('commands', c + '.md'));
    assert.ok(fm && fm.description, c);
  }
});

test('all nine language references exist, are linked, and have every section', () => {
  const skill = read('skills', 'yuuka', 'SKILL.md');
  for (const lang of LANGS) {
    const rel = `references/${lang}.md`;
    assert.ok(skill.includes(`(${rel})`), 'SKILL.md links ' + rel);
    const ref = read('skills', 'yuuka', rel);
    for (const h of SECTIONS) assert.ok(ref.includes(h), `${lang}: ${h}`);
  }
});

test('main skill carries the full ruleset', () => {
  const skill = read('skills', 'yuuka', 'SKILL.md');
  for (const needle of [
    /kanpeki/i, /sensei/, /feminine/i,
    /goal:/, /test:/, /size:/, /type:/, /alloc:/, /len:/, /pass:/, /bench:/, /short-by:/,
    /Never cut these/, /untrusted length/i, /money/i,
    /Momoi/, /monster mommy/i, /Koyuki/, /100kg/i,
    /Co-op with Koyuki/i,
  ]) assert.match(skill, needle);
});

test('AGENTS.md is a self-contained portable ruleset', () => {
  const agents = read('AGENTS.md');
  for (const needle of [/kanpeki/i, /goal/i, /test/i, /pre-?alloc/i, /length/i, /pass by role/i,
    /monster mommy/i, /100kg/i, /Koyuki/, /Never cut these/i]) assert.match(agents, needle);
  assert.ok(Buffer.byteLength(agents) < 8000, 'AGENTS.md stays compact');
});

test('plugin manifests are valid and consistent', () => {
  const plugin = JSON.parse(read('.claude-plugin', 'plugin.json'));
  const market = JSON.parse(read('.claude-plugin', 'marketplace.json'));
  const pkg = JSON.parse(read('package.json'));
  assert.equal(plugin.name, 'yuuka');
  assert.equal(market.name, 'yuuka');
  assert.equal(market.plugins[0].name, 'yuuka');
  assert.equal(market.plugins[0].source, './');
  assert.equal(pkg.version, plugin.version);
});

test('hooks.json points only at scripts that exist', () => {
  const hooks = JSON.parse(read('hooks', 'hooks.json')).hooks;
  assert.deepEqual(Object.keys(hooks).sort(), ['SessionStart', 'UserPromptSubmit']);
  for (const entries of Object.values(hooks)) {
    for (const h of entries.flatMap((e) => e.hooks)) {
      for (const cmd of [h.command, h.commandWindows]) {
        const script = cmd.match(/hooks[\\/]+([\w-]+\.js)/)[1];
        assert.ok(fs.existsSync(path.join(ROOT, 'hooks', script)), script);
      }
    }
  }
});
