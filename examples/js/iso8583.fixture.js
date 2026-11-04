// Test-card fixtures for the ISO 8583 demo. Never put real card data in fixtures:
// 4111111111111111 is the public Visa test PAN.

const enc = (s) => Uint8Array.from(s, (c) => c.charCodeAt(0));

// A typical 0200 purchase request: chip card, EMV data in DE55.
function request0200({ iccBytes = 180 } = {}) {
  const f = new Array(129);
  f[2] = enc('4111111111111111');
  f[3] = enc('000000');
  f[4] = enc('000000001000'); // 10.00 in minor units
  f[7] = enc('1104123045');
  f[11] = enc('000123');
  f[12] = enc('193045');
  f[13] = enc('1104');
  f[14] = enc('2812');
  f[22] = enc('051');
  f[35] = enc('4111111111111111=28121010000012300000'); // exactly 37: LLVAR at capacity
  f[37] = enc('430812345678');
  f[41] = enc('TERM0001');
  f[42] = enc('MERCHANT0000001');
  f[49] = enc('764');
  f[55] = Uint8Array.from({ length: iccBytes }, (_, i) => (i * 7) & 0xff);
  return f;
}

// The 0210 the gateway answers with: echoed request fields (as views) + 38/39.
const ECHO = [3, 4, 7, 11, 12, 13, 37, 41, 42, 49];
function response0210(req) {
  const f = new Array(129);
  for (const de of ECHO) if (req.has(de)) f[de] = req.view(de);
  f[38] = enc('A1B2C3');
  f[39] = enc('00');
  return f;
}

module.exports = { enc, request0200, response0210, ECHO };
