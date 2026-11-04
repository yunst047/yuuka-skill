// ISO 8583 gateway demo — parse a request frame, pack a response frame.
// Dialect (illustrative; every network/host has its own): 2-byte big-endian
// length header, ASCII MTI, binary bitmaps, ASCII numerics, ASCII LL/LLL prefixes.
// Naive versions are the line items Yuuka flags; kanpeki versions are the fix.

// --- Spec table: data, indexed by field number (no string keys) --------------

const FIXED = 1, LLVAR = 2, LLLVAR = 3;
const PREFIX = Uint8Array.of(0, 0, 2, 3); // prefix width by kind
const N = 1, AN = 2, ANS = 3, Z = 4, B = 5;

const KIND = new Uint8Array(129); // 0 = field not in this dialect
const MAX = new Uint16Array(129); // FIXED: exact length; LL/LLL: max length
const CHARSET = new Uint8Array(129);
for (const [de, kind, cs, max] of [
  [2, LLVAR, N, 19], [3, FIXED, N, 6], [4, FIXED, N, 12], [7, FIXED, N, 10],
  [11, FIXED, N, 6], [12, FIXED, N, 6], [13, FIXED, N, 4], [14, FIXED, N, 4],
  [22, FIXED, N, 3], [35, LLVAR, Z, 37], [37, FIXED, AN, 12], [38, FIXED, AN, 6],
  [39, FIXED, AN, 2], [41, FIXED, ANS, 8], [42, FIXED, ANS, 15], [49, FIXED, N, 3],
  [55, LLLVAR, B, 255], [64, FIXED, B, 8], [70, FIXED, N, 3], [128, FIXED, B, 8],
]) { KIND[de] = kind; CHARSET[de] = cs; MAX[de] = max; }

const HEADER = 2, MTI_LEN = 4, BITMAP = 8;
const MIN_BODY = MTI_LEN + BITMAP;
// yuuka: frame cap for this dialect — its largest legal message is < 600 B
// (sum of field maxima). Real hosts publish theirs; re-check when fields are added.
const MAX_BODY = 2048;
const EMPTY = new Uint8Array(0);

class Iso8583Error extends RangeError {
  constructor(code, de, detail) {
    super(`${code}${de ? ' DE' + de : ''}: ${detail}`);
    this.code = code;
    this.de = de;
  }
}

function need(p, n, end, de) {
  if (p + n > end) throw new Iso8583Error('TRUNCATED', de, `need ${n} bytes at ${p}, frame ends at ${end}`);
}

function readDigits(buf, off, n, de) {
  let v = 0;
  for (let i = 0; i < n; i++) {
    const d = buf[off + i] - 48;
    if (d < 0 || d > 9) throw new Iso8583Error('BAD_DIGIT', de, `byte 0x${buf[off + i].toString(16)} at ${off + i}`);
    v = v * 10 + d;
  }
  return v;
}

function checkDigits(buf, off, n, de) {
  for (let i = 0; i < n; i++) {
    const d = buf[off + i] - 48;
    if (d < 0 || d > 9) throw new Iso8583Error('BAD_DIGIT', de, `byte 0x${buf[off + i].toString(16)} at ${off + i}`);
  }
}

// --- Framing: the length header is untrusted input ---------------------------

// Bytes of the whole frame at the start of `chunk`, or -1 if the header hasn't
// fully arrived. Throws before any caller can size a buffer from a bad header.
function frameLength(chunk) {
  if (chunk.length < HEADER) return -1;
  const body = (chunk[0] << 8) | chunk[1];
  if (body < MIN_BODY || body > MAX_BODY) {
    throw new Iso8583Error('BAD_FRAME', 0, `body length ${body} outside [${MIN_BODY}, ${MAX_BODY}]`);
  }
  return HEADER + body;
}

// --- Parse -------------------------------------------------------------------

// Naive: copy the frame into a string, bitmap as a '0'/'1' string, every field a
// fresh substring in a string-keyed object. No caps, no digit checks.
function parseNaive(frame) {
  const s = Buffer.from(frame).toString('latin1');
  const mti = s.slice(2, 6);
  let bits = '';
  for (let i = 6; i < 14; i++) bits += s.charCodeAt(i).toString(2).padStart(8, '0');
  let p = 14;
  if (bits[0] === '1') {
    for (let i = 14; i < 22; i++) bits += s.charCodeAt(i).toString(2).padStart(8, '0');
    p = 22;
  }
  const fields = {};
  for (let i = 1; i < bits.length; i++) {
    if (bits[i] !== '1') continue;
    const de = i + 1;
    let len = MAX[de];
    if (KIND[de] === LLVAR) { len = parseInt(s.substr(p, 2), 10); p += 2; }
    else if (KIND[de] === LLLVAR) { len = parseInt(s.substr(p, 3), 10); p += 3; }
    fields[de] = s.slice(p, p + len);
    p += len;
  }
  return { mti, fields };
}

// Kanpeki: a caller-owned, reusable message of fixed typed arrays. Fields are
// (offset, length) pairs into the borrowed frame — zero copies on parse.
class IsoMessage {
  constructor() {
    this.frame = EMPTY;
    this.mti = -1;
    this.bitmap = new Uint8Array(16);
    this.off = new Uint16Array(129); // yuuka: uint16 fits — offsets < HEADER + MAX_BODY
    this.len = new Uint16Array(129);
  }

  clear() {
    this.frame = EMPTY;
    this.mti = -1;
    this.bitmap.fill(0);
  }

  has(de) {
    return de >= 2 && de <= 128 && (this.bitmap[(de - 1) >> 3] & (0x80 >> ((de - 1) & 7))) !== 0;
  }

  #need(de) {
    if (!this.has(de)) throw new Iso8583Error('ABSENT', de, 'field not present');
  }

  // Borrowed view: valid only until the frame's buffer is reused.
  view(de) {
    this.#need(de);
    return this.frame.subarray(this.off[de], this.off[de] + this.len[de]);
  }

  // Owned copy, for fields that outlive the frame (STAN/RRN for reversal matching).
  copy(de) {
    this.#need(de);
    return this.frame.slice(this.off[de], this.off[de] + this.len[de]);
  }

  // Numeric field straight from the digits — no string, no float.
  num(de) {
    this.#need(de);
    if (CHARSET[de] !== N) throw new TypeError(`DE${de} is not numeric`);
    // yuuka: 15 digits < 2^53, so the integer is exact; DE2 (19) must stay bytes.
    if (this.len[de] > 15) throw new Iso8583Error('TOO_LONG', de, 'exceeds safe integer digits');
    return readDigits(this.frame, this.off[de], this.len[de], de);
  }

  // DE4 in minor units (n12 ≤ 999,999,999,999). Pair with DE49's currency exponent.
  amountMinor() {
    return this.num(4);
  }

  // Cold path (logging, display): decodes without copying the frame.
  text(de) {
    const v = this.view(de);
    return Buffer.from(v.buffer, v.byteOffset, v.length).toString('latin1');
  }

  // first-6/last-4, built from bytes so the full PAN never becomes a string.
  maskedPan() {
    const v = this.view(2);
    const n = v.length;
    if (n <= 10) return '*'.repeat(n);
    let s = '';
    for (let i = 0; i < n; i++) s += i < 6 || i >= n - 4 ? String.fromCharCode(v[i]) : '*';
    return s;
  }
}

function parseKanpeki(frame, msg = new IsoMessage()) {
  const end = frame.length;
  if (end < HEADER) throw new Iso8583Error('TRUNCATED', 0, `${end} bytes, no length header`);
  if (frameLength(frame) !== end) throw new Iso8583Error('BAD_FRAME', 0, `header says ${frameLength(frame)}, got ${end}`);
  msg.clear();
  try {
    let p = HEADER;
    const mti = readDigits(frame, p, MTI_LEN, 0);
    p += MTI_LEN;
    const bm = msg.bitmap;
    for (let i = 0; i < BITMAP; i++) bm[i] = frame[p + i];
    p += BITMAP;
    let bmBytes = BITMAP;
    if (bm[0] & 0x80) {
      need(p, BITMAP, end, 1);
      for (let i = 0; i < BITMAP; i++) bm[BITMAP + i] = frame[p + i];
      p += BITMAP;
      bmBytes = 2 * BITMAP;
    }
    for (let i = 0; i < bmBytes; i++) {
      const byte = bm[i];
      if (byte === 0) continue;
      for (let bit = 0; bit < 8; bit++) {
        if ((byte & (0x80 >> bit)) === 0) continue;
        const de = (i << 3) + bit + 1;
        if (de === 1) continue; // the secondary-bitmap flag
        const kind = KIND[de];
        if (kind === 0) throw new Iso8583Error('UNKNOWN_FIELD', de, 'bit set, field not in spec');
        let len = MAX[de];
        if (kind !== FIXED) {
          const w = PREFIX[kind];
          need(p, w, end, de);
          len = readDigits(frame, p, w, de);
          p += w;
          if (len > MAX[de]) throw new Iso8583Error('TOO_LONG', de, `length ${len} > max ${MAX[de]}`);
        }
        need(p, len, end, de);
        if (CHARSET[de] === N) checkDigits(frame, p, len, de);
        msg.off[de] = p;
        msg.len[de] = len;
        p += len;
      }
    }
    if (p !== end) throw new Iso8583Error('TRAILING', 0, `${end - p} bytes after the last field`);
    msg.mti = mti;
    msg.frame = frame;
    return msg;
  } catch (e) {
    msg.clear(); // never leave half-parsed fields readable
    throw e;
  }
}

// --- Pack --------------------------------------------------------------------

// Naive: string concatenation per field, bitmap via a '0'/'1' string, then two
// more copies (latin1 → Buffer, header concat). No validation.
function packNaive(mti, fields) {
  const bits = new Array(128).fill('0');
  let body = '';
  for (let de = 2; de < fields.length; de++) {
    const v = fields[de];
    if (v === undefined) continue;
    bits[de - 1] = '1';
    if (de > 64) bits[0] = '1';
    const s = Buffer.from(v).toString('latin1');
    if (KIND[de] === LLVAR) body += String(s.length).padStart(2, '0');
    else if (KIND[de] === LLLVAR) body += String(s.length).padStart(3, '0');
    body += s;
  }
  const nBits = bits[0] === '1' ? 128 : 64;
  let bitmap = '';
  for (let i = 0; i < nBits; i += 8) bitmap += String.fromCharCode(parseInt(bits.slice(i, i + 8).join(''), 2));
  const bodyBuf = Buffer.from(String(mti).padStart(4, '0') + bitmap + body, 'latin1');
  const header = Buffer.alloc(2);
  header.writeUInt16BE(bodyBuf.length);
  return Buffer.concat([header, bodyBuf]);
}

function writeDigits(out, off, v, n) {
  for (let i = n - 1; i >= 0; i--) { out[off + i] = 48 + (v % 10); v = (v / 10) | 0; }
}

// Kanpeki: validate + size in pass 1, one exact allocation, write in pass 2.
// `fields` is indexed by field number; values are byte views (echoed request
// fields can be views straight into the request frame).
function packKanpeki(mti, fields) {
  if (!Number.isInteger(mti) || mti < 0 || mti > 9999) throw new Iso8583Error('BAD_MTI', 0, String(mti));
  const n = fields.length;
  if (n > 129) throw new Iso8583Error('UNKNOWN_FIELD', n - 1, 'beyond DE128');
  let size = HEADER + MTI_LEN + BITMAP;
  let secondary = false;
  for (let de = 2; de < n; de++) {
    const v = fields[de];
    if (v === undefined) continue;
    const kind = KIND[de];
    if (kind === 0) throw new Iso8583Error('UNKNOWN_FIELD', de, 'not in spec');
    const len = v.length;
    if (kind === FIXED && len !== MAX[de]) throw new Iso8583Error('BAD_LENGTH', de, `${len} != fixed ${MAX[de]}`);
    if (len > MAX[de]) throw new Iso8583Error('TOO_LONG', de, `length ${len} > max ${MAX[de]}`);
    if (CHARSET[de] === N) checkDigits(v, 0, len, de);
    if (de > 64) secondary = true;
    size += PREFIX[kind] + len;
  }
  if (secondary) size += BITMAP;
  if (size - HEADER > MAX_BODY) throw new Iso8583Error('BAD_FRAME', 0, `body ${size - HEADER} > ${MAX_BODY}`);

  const out = new Uint8Array(size); // the one allocation, exact size
  out[0] = (size - HEADER) >> 8;
  out[1] = (size - HEADER) & 0xff;
  writeDigits(out, HEADER, mti, MTI_LEN);
  const bm = HEADER + MTI_LEN;
  let p = bm + (secondary ? 2 * BITMAP : BITMAP);
  if (secondary) out[bm] = 0x80;
  for (let de = 2; de < n; de++) {
    const v = fields[de];
    if (v === undefined) continue;
    out[bm + ((de - 1) >> 3)] |= 0x80 >> ((de - 1) & 7);
    const w = PREFIX[KIND[de]];
    if (w) { writeDigits(out, p, v.length, w); p += w; }
    out.set(v, p);
    p += v.length;
  }
  return out;
}

module.exports = {
  MAX_BODY, IsoMessage, Iso8583Error, frameLength,
  parseNaive, parseKanpeki, packNaive, packKanpeki,
};
