#!/usr/bin/env node
// yuuka — detect a co-installed Koyuki (yunst047/niha-skills) so the two
// personas can split the work instead of talking over each other.
//
// Best-effort, any hit counts:
//   flag            <claudeDir>/.koyuki-active (her hooks write it; content = her mode)
//   installed_plugins / known_marketplaces   <claudeDir>/plugins/*.json mentioning koyuki
//   plugin_cache    <claudeDir>/plugins/{cache,marketplaces}/koyuki
//   user_skill      <claudeDir>/skills/koyuki
//   project_skill   <cwd>/.claude/skills/koyuki (koyuki-install into a repo)

const fs = require('fs');
const path = require('path');
const { getClaudeDir } = require('./yuuka-config');

const KOYUKI_MODES = ['lite', 'full', 'ultra', 'crack'];

function exists(p) {
  try { fs.accessSync(p); return true; } catch (e) { return false; }
}

function jsonMentionsKoyuki(file) {
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    return /koyuki/i.test(JSON.stringify(data));
  } catch (e) {
    return false;
  }
}

function detectKoyuki({ claudeDir = getClaudeDir(), cwd = process.cwd() } = {}) {
  const sources = [];
  let active = null;

  const flag = path.join(claudeDir, '.koyuki-active');
  if (exists(flag)) {
    sources.push('flag');
    try {
      const mode = fs.readFileSync(flag, 'utf8').trim().toLowerCase();
      if (KOYUKI_MODES.includes(mode)) active = mode;
    } catch (e) {}
  }

  const plugins = path.join(claudeDir, 'plugins');
  if (jsonMentionsKoyuki(path.join(plugins, 'installed_plugins.json'))) sources.push('installed_plugins');
  if (jsonMentionsKoyuki(path.join(plugins, 'known_marketplaces.json'))) sources.push('known_marketplaces');
  if (exists(path.join(plugins, 'cache', 'koyuki')) || exists(path.join(plugins, 'marketplaces', 'koyuki'))) {
    sources.push('plugin_cache');
  }
  if (exists(path.join(claudeDir, 'skills', 'koyuki'))) sources.push('user_skill');
  if (exists(path.join(cwd, '.claude', 'skills', 'koyuki'))) sources.push('project_skill');

  return { found: sources.length > 0, active, sources };
}

module.exports = { detectKoyuki, KOYUKI_MODES };
