// The kanpeki demo — each pair is the same behaviour, before and after the ledger.
// Naive versions are the line items Yuuka flags; kanpeki versions are the fix.

// --- 1. Pre-allocate (no copy-and-destroy) ----------------------------------

// Spread into a fresh array every iteration: O(n²) element copies, n garbage arrays.
function scaleNaive(values, factor) {
  return values.reduce((acc, v) => [...acc, v * factor], []);
}

// One exact allocation, int32 storage, length checked once, overflow refused.
function scaleKanpeki(values, factor) {
  const n = values.length;
  if (n === 0) return new Int32Array(0);
  const out = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    const r = values[i] * factor;
    // yuuka: Int32Array silently wraps — refuse anything outside int32 instead.
    if ((r | 0) !== r) throw new RangeError(`scale: ${values[i]} * ${factor} leaves int32 at index ${i}`);
    out[i] = r;
  }
  return out;
}

// --- 2. Letter vs number ----------------------------------------------------

// One 1-char string per character, plus an array of them, plus string-keyed Map.
function letterHistogramNaive(text) {
  const counts = new Map();
  for (const ch of text.toLowerCase().split('')) {
    if (ch >= 'a' && ch <= 'z') counts.set(ch, (counts.get(ch) || 0) + 1);
  }
  const out = [];
  for (let c = 0; c < 26; c++) out.push(counts.get(String.fromCharCode(97 + c)) || 0);
  return out;
}

// Numeric char codes indexing a fixed Uint32Array(26): one allocation total.
// Contract (both versions): counts ASCII a–z only, case-insensitive.
function letterHistogramKanpeki(text) {
  const counts = new Uint32Array(26);
  const n = text.length;
  for (let i = 0; i < n; i++) {
    const c = text.charCodeAt(i) | 0x20; // ASCII fold to lower case
    if (c >= 97 && c <= 122) counts[c - 97]++;
  }
  return counts;
}

// --- 3. Pass by role (read-only view, no copy) -------------------------------

// slice() copies the window just to read it.
function sumWindowNaive(values, start, end) {
  return values.slice(start, end).reduce((a, v) => a + v, 0);
}

// Read-only: index the caller's data in place; bounds validated once, up front.
function sumWindowKanpeki(values, start, end) {
  if (!(start >= 0 && end <= values.length && start <= end)) {
    throw new RangeError(`sumWindow: [${start}, ${end}) outside [0, ${values.length})`);
  }
  let sum = 0;
  for (let i = start; i < end; i++) sum += values[i];
  return sum;
}

module.exports = {
  scaleNaive, scaleKanpeki,
  letterHistogramNaive, letterHistogramKanpeki,
  sumWindowNaive, sumWindowKanpeki,
};
