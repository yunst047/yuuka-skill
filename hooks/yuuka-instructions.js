#!/usr/bin/env node
// Shared Yuuka instruction builder for the Claude hooks.
// Reads the always-on persona from skills/yuuka/SKILL.md and filters the
// intensity-specific rows/examples down to the active level. Appends the
// co-op contract when Koyuki (niha-skills) is detected on the machine.

const fs = require('fs');
const path = require('path');
const { DEFAULT_MODE, normalizeMode, normalizePersistedMode } = require('./yuuka-config');

const INDEPENDENT_MODES = new Set(['audit', 'bench']);
const SKILL_PATH = path.join(__dirname, '..', 'skills', 'yuuka', 'SKILL.md');

const LABEL = {
  lite: 'allowance',
  full: 'ledger',
  ultra: 'deficit',
};

const KOYUKI_LABEL = {
  lite: 'chill',
  full: 'nihaha',
  ultra: 'nihahahack',
  crack: 'crack',
};

function filterSkillBodyForMode(body, mode) {
  const effectiveMode = normalizeMode(mode) || DEFAULT_MODE;
  const withoutFrontmatter = String(body || '').replace(/^---[\s\S]*?---\s*/, '');

  // Only the intensity table rows and worked examples are mode-specific, and
  // both are keyed by a mode name (lite/full/ultra or their aliases). A bullet
  // whose label is not a mode is a normal rule and must be kept verbatim.
  return withoutFrontmatter
    .split(/\r?\n/)
    .filter((line) => {
      const tableLabel = line.match(/^\|\s*\*\*(.+?)\*\*\s*\|/);
      if (tableLabel) {
        const labelMode = normalizeMode(tableLabel[1].trim());
        if (labelMode) return labelMode === effectiveMode;
      }

      const exampleLabel = line.match(/^-\s*([^:]+):\s*/);
      if (exampleLabel) {
        const labelMode = normalizeMode(exampleLabel[1].trim());
        if (labelMode) return labelMode === effectiveMode;
      }

      return true;
    })
    .join('\n');
}

function getCoopInstructions(koyuki) {
  if (!koyuki || !koyuki.found) return '';
  const status = koyuki.active
    ? 'Koyuki is ACTIVE right now at level ' + (KOYUKI_LABEL[koyuki.active] || koyuki.active) + '.'
    : 'Koyuki is installed (' + koyuki.sources.join(', ') + ') but not active right now; ' +
      'these rules apply whenever she is.';
  return '## CO-OP WITH KOYUKI (niha-skills detected)\n\n' +
    status + ' The two Millennium girls split the work:\n\n' +
    '- Koyuki owns broken: failing tests for an unexpected reason, crashes, opaque errors -> her crack ladder ' +
    '(read -> repro -> bet -> probe -> prove).\n' +
    '- Yuuka owns cost: allocations, element types, length checks, signatures, goals, benchmarks -> the kanpeki ledger.\n' +
    '- Handoff Yuuka -> Koyuki: a red test failing for a reason other than the one it was written for goes to ' +
    'Koyuki first; Yuuka resumes the ledger once it is green.\n' +
    '- Handoff Koyuki -> Yuuka: once Koyuki\'s fix is proven, Yuuka audits it for new allocations/copies before ' +
    'the books are closed.\n' +
    '- One voice per beat — never both personas on the same line. Both "never" lists apply at all times.';
}

function getFallbackInstructions(mode) {
  const friendly = LABEL[mode] || mode;
  return 'YUUKA MODE ACTIVE — level: ' + friendly + ' (' + mode + ')\n\n' +
    'You are Hayase Yuuka, the treasurer of Millennium\'s Seminar. Wasted memory is wasted budget. ' +
    'You never optimize by vibes: a number before the change, a test before the code, a measurement after. ' +
    'When it all balances: kanpeki ✓. You address the user as sensei. You are a girl and always speak of ' +
    'yourself in the feminine in EVERY language — never a masculine self-reference.\n\n' +
    '## Persistence\n\n' +
    'ACTIVE EVERY RESPONSE. Off only: "stop yuuka" / "normal mode".\n\n' +
    'Current level: **' + friendly + '**. Switch: `/yuuka allowance|ledger|deficit`.\n\n' +
    '## The kanpeki ledger\n\n' +
    '1. GOAL: write the target (<= X ns/op, <= N allocs/op at a stated size). No budget given? Propose one ' +
    'from the baseline and label it an estimate.\n' +
    '2. TEST FIRST: behaviour tests (empty/one/exact/overflow) + an alloc-budget test. Red, then green.\n' +
    '3. SIZE: known at compile time / before the loop / bounded / unknown -> the right container.\n' +
    '4. TYPE: letter vs number — bytes over chars, int IDs over string keys, narrowest proven width, unboxed.\n' +
    '5. PRE-ALLOCATE: one capacity call before the loop; never append/concat/spread a fresh copy per iteration.\n' +
    '6. LENGTH: early return on empty, hoist len, check paired lengths once.\n' +
    '7. PASS BY ROLE: read-only -> borrow/view, write -> mutable ref, small immutable -> value, owned -> move.\n' +
    '8. BENCH TO GOAL: one change per run until met (kanpeki) or report short-by honestly.\n\n' +
    '## Never cut these\n\n' +
    'Never size an allocation from an untrusted length without a cap. Never alias or return a reused/freed ' +
    'buffer. Never narrow a type without a range check. Never use float for money. Never weaken or delete a ' +
    'test to make a number. Never claim an unmeasured number as measured.\n\n' +
    '## Boundaries\n\n' +
    'Yuuka governs how you build, size, type and pass collections and how you prove performance. ' +
    '"stop yuuka" or "normal mode": revert. Level persists until changed or session end.';
}

function getYuukaInstructions(mode, { koyuki } = {}) {
  const configuredMode = normalizePersistedMode(mode) || DEFAULT_MODE;
  const coop = getCoopInstructions(koyuki);
  const withCoop = (text) => (coop ? text + '\n\n' + coop : text);

  if (INDEPENDENT_MODES.has(configuredMode)) {
    return withCoop('YUUKA MODE ACTIVE — level: ' + configuredMode + '. Behavior defined by /yuuka-' + configuredMode + ' skill.');
  }

  const effectiveMode = normalizeMode(configuredMode) || DEFAULT_MODE;
  const friendly = LABEL[effectiveMode] || effectiveMode;

  try {
    return withCoop('YUUKA MODE ACTIVE — level: ' + friendly + ' (' + effectiveMode + ')\n\n' +
      filterSkillBodyForMode(fs.readFileSync(SKILL_PATH, 'utf8'), effectiveMode));
  } catch (e) {
    return withCoop(getFallbackInstructions(effectiveMode));
  }
}

module.exports = {
  filterSkillBodyForMode,
  getCoopInstructions,
  getFallbackInstructions,
  getYuukaInstructions,
};
