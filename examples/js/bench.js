#!/usr/bin/env node
// Bench to goal — Yuuka's way. Each case declares its goal BEFORE measuring;
// the run exits non-zero if any kanpeki version misses it.
//
//   npm run bench
//   node examples/js/bench.js --json   # machine-readable

const {
  scaleNaive, scaleKanpeki,
  letterHistogramNaive, letterHistogramKanpeki,
  sumWindowNaive, sumWindowKanpeki,
} = require('./build');
const { IsoMessage, parseNaive, parseKanpeki, packNaive, packKanpeki } = require('./iso8583');
const { request0200, response0210 } = require('./iso8583.fixture');

// A production-shaped 0200 (chip card, 180 B of EMV data) and its 0210 fields.
const ISO_REQ = packKanpeki(200, request0200());
const ISO_RESP_FIELDS = response0210(parseKanpeki(ISO_REQ));
const isoMsg = new IsoMessage(); // one per connection, reused per frame

// yuuka: two goals per case, both derived from measured baselines of THIS
// harness (Node 24, Ryzen 7 7735U; the clock swings ~2.5x between power-saving
// and boost, so kanpeki ran scale 12–29 µs, letters 50–160 µs, window 101–320 µs):
//   goalNsPerOp — absolute ceiling, ~2x over the slow-clock run.
//   minSpeedup  — kanpeki vs naive, interleaved in the same run; machine-independent,
//                 and the goal that actually separates the two (observed over 5
//                 interleaved runs: scale 467–523x, letters 5.6–8.1x, window 24–28x).
// A first draft guessed 15/60/150 µs *before* measuring and missed all three —
// never set a goal you haven't measured against.
// yuuka: ISO 8583 goals come from 5 interleaved baseline runs (same machine):
// parse kanpeki 486–544 ns at 7.6–8.4x, pack 1.7–2.1 µs at 4.7–5.5x. A probe put
// ~610 ns of pack in its one exact Uint8Array — kept on purpose: packing into a
// reused buffer would alias it while socket.write still holds it.
const CASES = [
  {
    name: 'scale', n: 2_000, goalNsPerOp: 60_000, minSpeedup: 100,
    setup: (n) => Array.from({ length: n }, (_, i) => (i % 1000) - 500),
    naive: (xs) => scaleNaive(xs, 3),
    kanpeki: (xs) => scaleKanpeki(xs, 3),
  },
  {
    name: 'letterHistogram', n: 10_000, goalNsPerOp: 300_000, minSpeedup: 3,
    setup: (n) => 'The quick brown fox jumps over the lazy dog. '.repeat(Math.ceil(n / 45)).slice(0, n),
    naive: (text) => letterHistogramNaive(text),
    kanpeki: (text) => letterHistogramKanpeki(text),
  },
  {
    name: 'sumWindow', n: 100_000, goalNsPerOp: 600_000, minSpeedup: 10,
    setup: (n) => Int32Array.from({ length: n }, (_, i) => i % 97),
    naive: (xs) => sumWindowNaive(xs, 1_000, xs.length - 1_000),
    kanpeki: (xs) => sumWindowKanpeki(xs, 1_000, xs.length - 1_000),
  },
  {
    name: 'iso8583.parse', n: ISO_REQ.length, goalNsPerOp: 1_500, minSpeedup: 4,
    setup: () => ISO_REQ,
    naive: (frame) => { const m = parseNaive(frame); return Number(m.fields[4]) + Number(m.fields[11]); },
    kanpeki: (frame) => { const m = parseKanpeki(frame, isoMsg); return m.amountMinor() + m.num(11); },
  },
  {
    name: 'iso8583.pack', n: packKanpeki(210, ISO_RESP_FIELDS).length, goalNsPerOp: 4_000, minSpeedup: 3,
    setup: () => ISO_RESP_FIELDS,
    naive: (f) => packNaive(210, f),
    kanpeki: (f) => packKanpeki(210, f),
  },
];

let sink = 0; // keeps results observable so the JIT can't delete the work

// One ~10 ms sample: ns per call.
function sample(fn, input) {
  let iters = 0;
  const t0 = process.hrtime.bigint();
  let t1 = t0;
  while (t1 - t0 < 10_000_000n) {
    sink ^= consume(fn(input));
    iters++;
    t1 = process.hrtime.bigint();
  }
  return Number(t1 - t0) / iters;
}

const median = (xs) => xs.sort((a, b) => a - b)[xs.length >> 1];

// Samples of the two versions are interleaved so both see the same CPU clock —
// laptops shift frequency mid-run, and back-to-back blocks skewed the speedup.
function measurePair(naiveFn, kanpekiFn, input, budgetMs = 600) {
  for (let i = 0; i < 20; i++) sink ^= consume(naiveFn(input)) ^ consume(kanpekiFn(input)); // warm-up
  const naive = [];
  const kanpeki = [];
  const deadline = process.hrtime.bigint() + BigInt(budgetMs) * 1_000_000n;
  while (process.hrtime.bigint() < deadline || naive.length < 5) {
    naive.push(sample(naiveFn, input));
    kanpeki.push(sample(kanpekiFn, input));
  }
  return { naive: median(naive), kanpeki: median(kanpeki) };
}

function consume(r) {
  return typeof r === 'number' ? r : r.length;
}

const fmt = (ns) => (ns >= 1e6 ? (ns / 1e6).toFixed(2) + ' ms' : ns >= 1e3 ? (ns / 1e3).toFixed(1) + ' µs' : ns.toFixed(0) + ' ns');

const results = CASES.map((c) => {
  const input = c.setup(c.n);
  const { naive, kanpeki } = measurePair(c.naive, c.kanpeki, input);
  const speedup = naive / kanpeki;
  const met = kanpeki <= c.goalNsPerOp && speedup >= c.minSpeedup;
  return { name: c.name, n: c.n, goalNsPerOp: c.goalNsPerOp, minSpeedup: c.minSpeedup, naive, kanpeki, speedup, met };
});

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ node: process.version, results }, null, 2));
} else {
  console.log(`Yuuka bench — node ${process.version}\n`);
  console.log('case             n       goal                   naive      kanpeki    speedup  verdict');
  for (const r of results) {
    const gaps = [];
    if (r.kanpeki > r.goalNsPerOp) gaps.push(fmt(r.kanpeki - r.goalNsPerOp));
    if (r.speedup < r.minSpeedup) gaps.push(`${(r.minSpeedup - r.speedup).toFixed(1)}x speedup`);
    console.log(
      r.name.padEnd(17) + String(r.n).padEnd(8) +
      (`≤ ${fmt(r.goalNsPerOp)}, ≥ ${r.minSpeedup}x`).padEnd(23) +
      fmt(r.naive).padEnd(11) + fmt(r.kanpeki).padEnd(11) +
      (r.speedup.toFixed(1) + 'x').padEnd(9) +
      (r.met ? 'kanpeki ✓' : 'short-by: ' + gaps.join(' + ')),
    );
  }
  const missed = results.filter((r) => !r.met);
  console.log(missed.length
    ? `\n(Momoi: the MONSTER MOMMY's perfect calculation failed?! ${missed.length} goal(s) missed!)`
    : '\nAll goals met — kanpeki ✓ 🧮  (the green-tests half is `npm test`)');
}

if (sink === 0.5) console.log(''); // never true; reads the sink
process.exitCode = results.every((r) => r.met) ? 0 : 1;
