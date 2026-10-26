#!/usr/bin/env node
// yuuka — UserPromptSubmit hook to track which Yuuka mode is active.
// Inspects user input for /yuuka commands and writes the mode to the flag file.
// Accepts both engine names (lite/full/ultra/off) and the Yuuka aliases
// (allowance/ledger/deficit). /yuuka-audit and /yuuka-bench are independent
// modes; /yuuka-alloc, /yuuka-pass and /yuuka-help are one-shot and change nothing.

const { getDefaultMode, normalizeMode } = require('./yuuka-config');
const { clearMode, setMode, writeHookOutput } = require('./yuuka-runtime');

const LABEL = { lite: 'allowance', full: 'ledger', ultra: 'deficit' };
const INDEPENDENT = { '/yuuka-audit': 'audit', '/yuuka-bench': 'bench' };

let input = '';
process.stdin.on('data', chunk => { input += chunk; });
process.stdin.on('end', () => {
  try {
    // Strip UTF-8 BOM some shells prepend when piping (breaks JSON.parse)
    const data = JSON.parse(input.replace(/^﻿/, ''));
    const prompt = (data.prompt || '').trim().toLowerCase();

    // Match /yuuka commands (also @yuuka / $yuuka for Codex-style hosts)
    if (/^[/@$]yuuka/.test(prompt)) {
      const parts = prompt.split(/\s+/);
      const cmd = parts[0].replace(/^[@$]/, '/').replace(/^\/yuuka:/, '/');
      const arg = parts[1] || '';

      let mode = null;

      if (INDEPENDENT[cmd]) {
        mode = INDEPENDENT[cmd];
      } else if (cmd === '/yuuka') {
        if (arg === 'off') mode = 'off';
        else mode = normalizeMode(arg) || getDefaultMode();
      }

      if (mode && mode !== 'off') {
        setMode(mode);
        writeHookOutput(
          'UserPromptSubmit',
          mode,
          'YUUKA MODE CHANGED — level: ' + (LABEL[mode] || mode),
        );
      } else if (mode === 'off') {
        clearMode();
        writeHookOutput('UserPromptSubmit', 'off', 'YUUKA MODE OFF');
      }
    }

    // Detect deactivation
    if (/\b(stop yuuka|normal mode)\b/i.test(prompt)) {
      clearMode();
      writeHookOutput('UserPromptSubmit', 'off', 'YUUKA MODE OFF');
    }
  } catch (e) {
    // Silent fail
  }
});
