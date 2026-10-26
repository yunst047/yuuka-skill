const test = require('node:test');
const assert = require('node:assert/strict');
const {
  filterSkillBodyForMode,
  getCoopInstructions,
  getFallbackInstructions,
  getYuukaInstructions,
} = require('../hooks/yuuka-instructions');

const BODY = [
  '---',
  'name: yuuka',
  'description: x',
  '---',
  '# Yuuka',
  '| Level | How |',
  '|---|---|',
  '| **allowance** | A |',
  '| **ledger** | L |',
  '| **deficit** | D |',
  '- allowance: example A',
  '- ledger: example L',
  '- deficit: example D',
  '- goal: a normal rule, never filtered',
  '- `size:` a tag line, never filtered',
].join('\n');

test('filter keeps only the active level row and example', () => {
  const out = filterSkillBodyForMode(BODY, 'full');
  assert.match(out, /\| \*\*ledger\*\* \| L \|/);
  assert.match(out, /- ledger: example L/);
  assert.doesNotMatch(out, /\*\*allowance\*\*|\*\*deficit\*\*/);
  assert.doesNotMatch(out, /example A|example D/);
});

test('filter keeps non-mode bullets and strips frontmatter', () => {
  const out = filterSkillBodyForMode(BODY, 'ultra');
  assert.match(out, /- goal: a normal rule/);
  assert.match(out, /`size:` a tag line/);
  assert.match(out, /example D/);
  assert.doesNotMatch(out, /^---/);
  assert.doesNotMatch(out, /description: x/);
});

test('filter falls back to the default level for unknown modes', () => {
  const out = filterSkillBodyForMode(BODY, 'nonsense');
  assert.match(out, /example L/);
  assert.doesNotMatch(out, /example A/);
});

test('real SKILL.md: ledger level is filtered correctly', () => {
  const out = getYuukaInstructions('full');
  assert.ok(out.startsWith('YUUKA MODE ACTIVE — level: ledger (full)'));
  assert.match(out, /\| \*\*ledger\*\* \|/);
  assert.doesNotMatch(out, /\| \*\*deficit\*\* \|/);
  assert.doesNotMatch(out, /\| \*\*allowance\*\* \|/);
  assert.match(out, /kanpeki/i);
  assert.doesNotMatch(out, /^name: yuuka/m);
});

test('real SKILL.md: every level has exactly one row and one example', () => {
  for (const [mode, label] of [['lite', 'allowance'], ['full', 'ledger'], ['ultra', 'deficit']]) {
    const out = getYuukaInstructions(label);
    assert.equal(out.match(new RegExp(`^\\| \\*\\*${label}\\*\\* \\|`, 'gm')).length, 1, label + ' row');
    assert.equal(out.match(new RegExp(`^- ${label}:`, 'gm')).length, 1, label + ' example');
    assert.ok(out.includes(`(${mode})`));
  }
});

test('independent modes defer to their skill', () => {
  assert.equal(getYuukaInstructions('bench'),
    'YUUKA MODE ACTIVE — level: bench. Behavior defined by /yuuka-bench skill.');
  assert.equal(getYuukaInstructions('audit'),
    'YUUKA MODE ACTIVE — level: audit. Behavior defined by /yuuka-audit skill.');
});

test('co-op block appears only when Koyuki is found', () => {
  const solo = getYuukaInstructions('full', { koyuki: { found: false, active: null, sources: [] } });
  assert.doesNotMatch(solo, /CO-OP WITH KOYUKI/);

  const duo = getYuukaInstructions('full', { koyuki: { found: true, active: 'full', sources: ['flag'] } });
  assert.match(duo, /CO-OP WITH KOYUKI/);

  const benchDuo = getYuukaInstructions('bench', { koyuki: { found: true, active: null, sources: ['user_skill'] } });
  assert.match(benchDuo, /CO-OP WITH KOYUKI/);
});

test('co-op block states ownership, handoffs and her live level', () => {
  const coop = getCoopInstructions({ found: true, active: 'ultra', sources: ['flag'] });
  assert.match(coop, /Koyuki owns broken/i);
  assert.match(coop, /Yuuka owns cost/i);
  assert.match(coop, /handoff/i);
  assert.match(coop, /nihahahack/);

  const installedOnly = getCoopInstructions({ found: true, active: null, sources: ['installed_plugins'] });
  assert.match(installedOnly, /installed/i);
  assert.equal(getCoopInstructions({ found: false, active: null, sources: [] }), '');
});

test('fallback ruleset carries the ledger and the never-cut list', () => {
  const out = getFallbackInstructions('ultra');
  assert.match(out, /level: deficit \(ultra\)/);
  assert.match(out, /kanpeki/i);
  assert.match(out, /untrusted length/i);
  assert.match(out, /money/i);
  assert.match(out, /test/i);
});
