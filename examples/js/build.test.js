// Behaviour + budget tests for the kanpeki demo — written before build.js.

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  scaleNaive, scaleKanpeki,
  letterHistogramNaive, letterHistogramKanpeki,
  sumWindowNaive, sumWindowKanpeki,
} = require('./build');

// A read-only input that explodes if anyone copies it.
class NoCopy extends Int32Array {
  slice() { throw new Error('copied a read-only input'); }
  map() { throw new Error('copied a read-only input'); }
  filter() { throw new Error('copied a read-only input'); }
}

test('scale: empty, one, many — naive and kanpeki agree', () => {
  for (const input of [[], [7], [1, -2, 3, 0, 2147483]]) {
    const want = input.map((v) => v * 3);
    assert.deepEqual(scaleNaive(input, 3), want);
    assert.deepEqual(Array.from(scaleKanpeki(input, 3)), want);
  }
});

test('scale budget: exactly one exact-size allocation, numeric storage', () => {
  const out = scaleKanpeki(NoCopy.from([1, 2, 3]), 2);
  assert.ok(out instanceof Int32Array);
  assert.equal(out.length, 3);
  assert.equal(out.buffer.byteLength, 3 * Int32Array.BYTES_PER_ELEMENT);
});

test('scale never narrows below the proven range', () => {
  assert.throws(() => scaleKanpeki([2 ** 30], 4), RangeError);
  assert.throws(() => scaleKanpeki([1], 0.5), RangeError);
  assert.deepEqual(Array.from(scaleKanpeki([-(2 ** 30)], 2)), [-(2 ** 31)]);
});

test('letters: numeric char codes count the same as string keys', () => {
  for (const text of ['', 'a', 'Hello, World!', 'The quick brown fox jumps over the lazy dog', '123 ++ ##']) {
    const want = letterHistogramNaive(text);
    const got = letterHistogramKanpeki(text);
    assert.ok(got instanceof Uint32Array);
    assert.equal(got.length, 26);
    assert.deepEqual(Array.from(got), want, JSON.stringify(text));
  }
  const h = letterHistogramKanpeki('AaZz');
  assert.equal(h[0], 2);
  assert.equal(h[25], 2);
});

test('sumWindow: read-only view, no copy, bounds checked once', () => {
  const data = NoCopy.from([5, 1, 2, 3, 4]);
  assert.equal(sumWindowKanpeki(data, 1, 4), 6);
  assert.equal(sumWindowKanpeki(data, 0, 5), 15);
  assert.equal(sumWindowKanpeki(data, 2, 2), 0);
  assert.equal(sumWindowNaive([5, 1, 2, 3, 4], 1, 4), 6);
});

test('sumWindow rejects bad windows instead of reading undefined', () => {
  const data = Int32Array.from([1, 2, 3]);
  assert.throws(() => sumWindowKanpeki(data, -1, 2), RangeError);
  assert.throws(() => sumWindowKanpeki(data, 0, 4), RangeError);
  assert.throws(() => sumWindowKanpeki(data, 2, 1), RangeError);
});
