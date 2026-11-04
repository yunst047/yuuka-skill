// Behaviour + budget tests for the ISO 8583 gateway demo — written before iso8583.js.

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  MAX_BODY, IsoMessage, Iso8583Error, frameLength,
  parseNaive, parseKanpeki, packNaive, packKanpeki,
} = require('./iso8583');
const { enc, request0200, response0210 } = require('./iso8583.fixture');

const hex = (u8) => Buffer.from(u8).toString('hex');
const code = (c) => (e) => e instanceof Iso8583Error && e.code === c;

// Re-frame a hand-edited body so only the thing under test is wrong.
function frameOf(body) {
  const out = new Uint8Array(2 + body.length);
  out[0] = body.length >> 8;
  out[1] = body.length & 0xff;
  out.set(body, 2);
  return out;
}

// A read-only input that explodes if the parser copies it.
class NoCopy extends Uint8Array {
  slice() { throw new Error('copied the read-only frame'); }
}

test('golden 0800 echo: secondary bitmap, exact bytes both ways', () => {
  const f = new Array(129);
  f[7] = enc('1104123045');
  f[11] = enc('000001');
  f[70] = enc('301');
  const want =
    '0027' + '30383030' + // len 39, MTI "0800"
    '8220000000000000' + // primary: bits 1 (secondary), 7, 11
    '0400000000000000' + // secondary: bit 70
    hex(enc('1104123045000001301'));
  assert.equal(hex(packKanpeki(800, f)), want);
  assert.equal(hex(packNaive(800, f)), want);

  const m = parseKanpeki(Buffer.from(want, 'hex'));
  assert.equal(m.mti, 800);
  assert.deepEqual([7, 11, 70].map((de) => m.has(de)), [true, true, true]);
  assert.equal(m.has(1), false, 'bit 1 is the bitmap flag, not a field');
  assert.equal(m.num(70), 301);
});

test('0200 round-trip; naive and kanpeki agree field by field', () => {
  const req = request0200();
  const frame = packKanpeki(200, req);
  assert.equal(hex(packNaive(200, req)), hex(frame));

  const m = parseKanpeki(frame);
  const n = parseNaive(frame);
  assert.equal(m.mti, 200);
  assert.equal(n.mti, '0200');
  for (let de = 2; de <= 128; de++) {
    assert.equal(m.has(de), req[de] !== undefined, 'DE' + de);
    if (!req[de]) continue;
    assert.deepEqual(m.view(de), req[de], 'DE' + de);
    assert.equal(n.fields[de], Buffer.from(req[de]).toString('latin1'), 'naive DE' + de);
  }
});

test('money: DE4 is integer minor units, exact up to n12 max', () => {
  const req = request0200();
  assert.equal(parseKanpeki(packKanpeki(200, req)).amountMinor(), 1000);
  req[4] = enc('999999999999');
  const amt = parseKanpeki(packKanpeki(200, req)).amountMinor();
  assert.equal(amt, 999_999_999_999);
  assert.ok(Number.isSafeInteger(amt));
});

test('PAN is masked first-6/last-4 for logs', () => {
  const m = parseKanpeki(packKanpeki(200, request0200()));
  assert.equal(m.maskedPan(), '411111******1111');
});

test('exactly at capacity: LLVAR 19 / 37 and LLLVAR 255 pass', () => {
  const req = request0200({ iccBytes: 255 });
  req[2] = enc('4111111111111111111');
  const m = parseKanpeki(packKanpeki(200, req));
  assert.equal(m.view(2).length, 19);
  assert.equal(m.view(35).length, 37);
  assert.equal(m.view(55).length, 255);
});

test('overflow: one past the field max is refused on pack and on parse', () => {
  const req = request0200({ iccBytes: 256 });
  assert.throws(() => packKanpeki(200, req), code('TOO_LONG'));

  // Hand-craft LL = "20" for DE2 (max 19) behind a valid header.
  const body = Uint8Array.from([...enc('0200'), 0x40, 0, 0, 0, 0, 0, 0, 0, ...enc('20'), ...enc('4'.repeat(20))]);
  assert.throws(() => parseKanpeki(frameOf(body)), code('TOO_LONG'));
});

test('fixed fields must be exact; numeric fields must be digits', () => {
  const req = request0200();
  req[4] = enc('1000');
  assert.throws(() => packKanpeki(200, req), code('BAD_LENGTH'));
  req[4] = enc('00000000100A');
  assert.throws(() => packKanpeki(200, req), code('BAD_DIGIT'));

  const frame = packKanpeki(200, request0200());
  const bad = Uint8Array.from(frame);
  bad[2] = 0x41; // MTI "A200"
  assert.throws(() => parseKanpeki(bad), code('BAD_DIGIT'));
});

test('empty and header-only input are refused, not read past', () => {
  assert.throws(() => parseKanpeki(new Uint8Array(0)), code('TRUNCATED'));
  assert.throws(() => parseKanpeki(Uint8Array.from([0, 0])), code('BAD_FRAME'));
  assert.equal(frameLength(new Uint8Array(0)), -1);
  assert.equal(frameLength(Uint8Array.from([0])), -1, 'need both header bytes');
});

test('untrusted length header is capped before anything is sized from it', () => {
  assert.throws(() => frameLength(Uint8Array.from([0xff, 0xff])), code('BAD_FRAME'));
  assert.throws(() => frameLength(Uint8Array.from([(MAX_BODY + 1) >> 8, (MAX_BODY + 1) & 0xff])), code('BAD_FRAME'));
  const frame = packKanpeki(200, request0200());
  assert.equal(frameLength(frame), frame.length);
  // Header claims more than arrived → mismatch, not an out-of-bounds read.
  assert.throws(() => parseKanpeki(frame.subarray(0, frame.length - 1)), code('BAD_FRAME'));
});

test('truncated field, unknown field bit, trailing bytes', () => {
  const frame = packKanpeki(200, request0200());
  const body = frame.subarray(2);
  assert.throws(() => parseKanpeki(frameOf(body.subarray(0, body.length - 3))), code('TRUNCATED'));

  const unknown = Uint8Array.from(body);
  unknown[4] |= 0x08; // bit 5: not in the spec table
  assert.throws(() => parseKanpeki(frameOf(unknown)), code('UNKNOWN_FIELD'));

  assert.throws(() => parseKanpeki(frameOf(Uint8Array.from([...body, 0x30]))), code('TRAILING'));
});

test('pass by role: parse borrows the frame, never copies it', () => {
  const frame = NoCopy.from(packKanpeki(200, request0200()));
  const m = parseKanpeki(frame);
  const v = m.view(42);
  assert.equal(v.buffer, frame.buffer, 'view() aliases the frame');
  assert.equal(m.text(42), 'MERCHANT0000001');
});

test('reused message: no stale fields, no stale state after a failed parse', () => {
  const m = new IsoMessage();
  parseKanpeki(packKanpeki(200, request0200()), m);
  assert.ok(m.has(55));

  const echo = new Array(129);
  echo[7] = enc('1104123045');
  echo[11] = enc('000002');
  assert.equal(parseKanpeki(packKanpeki(800, echo), m), m, 'fills the caller-owned message');
  assert.equal(m.has(55), false);
  assert.equal(m.num(11), 2);

  assert.throws(() => parseKanpeki(Uint8Array.from([0, 12, ...enc('0200'), 0xff, 0, 0, 0, 0, 0, 0, 0]), m));
  assert.equal(m.has(2), false, 'a failed parse leaves nothing readable');
  assert.throws(() => m.view(11), code('ABSENT'));
});

test('copy() owns its bytes: safe to keep after the read buffer is reused', () => {
  const frame = packKanpeki(200, request0200());
  const m = parseKanpeki(frame);
  const stan = m.copy(11);
  const view = m.view(11);
  frame.fill(0x39); // the connection reuses its read buffer
  assert.equal(Buffer.from(stan).toString('latin1'), '000123');
  assert.notEqual(Buffer.from(view).toString('latin1'), '000123', 'views die with the buffer');
});

test('pack budget: one exact allocation, 0210 echoes request views', () => {
  const req = parseKanpeki(packKanpeki(200, request0200()));
  const out = packKanpeki(210, response0210(req));
  assert.equal(out.buffer.byteLength, out.length, 'no slack, no second buffer');
  const r = parseKanpeki(out);
  assert.equal(r.mti, 210);
  assert.equal(r.text(39), '00');
  assert.equal(r.amountMinor(), 1000);
  assert.equal(r.has(2), false, 'the PAN is not echoed');
});

test('pack refuses bad MTIs and fields outside the spec table', () => {
  assert.throws(() => packKanpeki(10000, request0200()), code('BAD_MTI'));
  assert.throws(() => packKanpeki(-1, request0200()), code('BAD_MTI'));
  const f = request0200();
  f[5] = enc('000000000000');
  assert.throws(() => packKanpeki(200, f), code('UNKNOWN_FIELD'));
  assert.throws(() => packKanpeki(200, new Array(130)), code('UNKNOWN_FIELD'));
});
