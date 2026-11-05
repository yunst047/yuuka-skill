# PCI DSS card-data ledger sheet

A domain sheet: open it alongside the language sheet when code touches
cardholder data: it accepts, validates, tokenises, encrypts, masks, logs or
detokenises a PAN, or handles sensitive authentication data (SAD: full track,
CVV/CVC, PIN block). The ledger rungs are the same; this sheet says what they
mean when every buffer might hold card data. Requirement numbers are PCI DSS
v4.0. If the code also speaks ISO 8583, open
[iso8583.md](iso8583.md) too.

## When this sheet applies

- A card-capture or tokenisation API, a vault, a payment service, or any handler whose request or response carries a PAN.
- Crypto on card data: AES-GCM sealing at rest (3.5.1), keyed PAN fingerprints (3.5.1.1), token generation.
- PAN masking for display (3.4.1), log redaction (10.3 / 3.4.1), audit trails (10.2).

PCI DSS makes many controls **non-negotiable costs**: crypto, constant-time compares, slow password KDFs, audit writes. Yuuka trims what surrounds them, such as copies, conversions and per-call setup. She never trims the control itself.

## Goal & tests

**Goal.** Measure first. AES-GCM on a 19-byte PAN costs well under 1 µs with AES-NI, an HMAC-SHA-256 fingerprint costs about 1 µs, and a DB or KMS round trip costs milliseconds. A tokenise call is usually I/O-bound, so state the budget per call around the I/O: `goal: tokenize (excl. store) ≤ 3 µs · ≤ 4 allocs`. The **log redactor runs on every log line**, so it is usually the hottest card-data code in the process: `goal: redact a digit-free line ≤ 50 ns · 0 allocs`. A path already under 1% CPU is a cold path: say so and stop.

**Tests first**:

- **Leak test.** Send a test PAN and CVV through every endpoint, then assert that neither appears in the response body, error text, log output, audit trail or metrics. This test is never deleted or "relaxed" to pass a benchmark.
- **PAN bounds.** 12 digits is refused, 13 and 19 are accepted, 20 is refused, and a failed Luhn check is refused. Separators (space, dash) are stripped, and any other character is refused.
- **Mask.** At most BIN + last 4 is visible (first 6 / last 4), or a stricter rule if the code uses one. Check `len ≤ 4` and that the output length equals the input length.
- **Crypto.** Sealing the same PAN twice gives different ciphertexts (fresh nonce). A ciphertext moved to another token fails `Open` because the token is bound as AAD. A truncated ciphertext (`< nonce + tag`) returns an error, not a panic.
- **Fingerprint.** It is the same for the same owner and PAN, different across owners, and different under a different HMAC key.
- **Wipe.** After `Wipe()`, a pool `Put`, or the end of the handler, the plaintext buffer is all zero bytes.
- **Budget.** Assert allocations per call (`testing.AllocsPerRun`, JMH `-prof gc`, `[MemoryDiagnoser]`, dhat) on tokenise, mask and redact.
- **Fixtures use test cards only** (`4111111111111111`, `5555555555554444`, `378282246310005`). Real PANs never enter a repo, a test log or a benchmark fixture.

## Size & frame caps

| Size known… | Use |
|---|---|
| at compile time: PAN | `[19]byte` + `uint8` length. Networks issue 13–19 digits; check the length before copying. |
| at compile time: token | Fixed size, e.g. `tok_` + 36 hex = 40 bytes; `hex.Encode` into a `[40]byte`. |
| at compile time: fingerprint | `[32]byte` (HMAC-SHA-256). Use it directly as the map key, not hex. |
| per record: ciphertext | Exactly `nonce + len(pan) + tag` (12 + n + 16 for GCM). One allocation, sized exactly. |
| per request: body | Cap the body before decoding (`http.MaxBytesReader`, e.g. 16 KiB). It is the first untrusted length. |
| per display: mask | Exactly `len(pan)` bytes. One allocation, or zero when writing into a caller's buffer. |

Seal, Go, with one allocation instead of two:

```go
ns := v.aead.NonceSize()
buf := make([]byte, ns, ns+len(pan)+v.aead.Overhead()) // yuuka: exact — nonce || ct || tag
if _, err := rand.Read(buf); err != nil { return err }
ct := v.aead.Seal(buf, buf, pan, tok) // appends in place: cap already fits, no regrow
```

`nonce := make([]byte, ns)` followed by `Seal(nonce, nonce, …)` has capacity `ns`, so `Seal` reallocates. Two allocations, plus one dead nonce buffer.

## Letter vs number

- **PAN** → ASCII digit **bytes** you can zero. Never a `string` in GC languages (strings are immutable and can't be wiped), and never an integer: 19 digits overflow `int64` (max ≈ 9.22 × 10¹⁸). Convert to a string only at the JSON boundary, and only where the role is allowed to see it.
- **CVV / PIN block / track** → validated in place from the request bytes, then gone. Never copied into a struct field, cache or queue entry that outlives the handler (3.3.1).
- **Brand** → `uint8` enum from a prefix switch. Convert to a string once, at the response boundary.
- **Fingerprint** → `[32]byte`, not a 64-char hex string. Hex costs one allocation and 32 extra bytes per map entry.
- **Expiry** → `uint8` month and `uint16` year, range-checked.
- **Amount** → `int64` **minor units** + ISO 4217 currency code. **Never float.**
- **Keys** → `[]byte` / `[32]byte` held once in the vault struct. Never a `string`, never logged, compared with `subtle.ConstantTimeCompare`.

## Pre-allocate & reuse

- **Build once, at startup**: `cipher.AEAD` (the AES key schedule and GCM tables), HMAC key, regexes, allow-lists. Never `aes.NewCipher` per request.
- **HMAC per call**: `hmac.New` allocates two hash states and pads. Pool them (`sync.Pool` of `hash.Hash`, `Reset()` before use, which restores the keyed state), and write the sum into a fixed array: `m.Sum(fp[:0])`.
- **Plaintext buffers** (`Open` output, normalised PAN) may be pooled **only if they are zeroed before `Put`**: `clear(b); pool.Put(b)`. A pooled buffer still holding a PAN is a second, unaudited copy of card data.
- **Open into the caller's buffer**: `aead.Open(dst[:0], nonce, ct, aad)` with `cap(dst) ≥ 19`. That costs zero allocations, and the caller wipes it.
- **Mask and redact into fixed scratch**: `var m [19]byte`. Fill `*`, then copy the last 4. There is no `Repeat` + concatenation.
- **Redactor fast path**: one byte scan for a run of ≥ 13 digits (allowing separators) before any regex. Most log lines have none, so they cost 0 allocations and return the input unchanged.

## Length checks

- **Body cap first**, before JSON decoding. Then strict decoding (`DisallowUnknownFields`) so unexpected cardholder fields, such as the cardholder name, are refused rather than silently kept (3.2.1).
- **PAN normalisation counts digits as it goes** and fails on digit 20. It never grows an unbounded builder from client input, then checks `13 ≤ n ≤ 19` before copying into `[19]byte`.
- **CVV**: exactly 3 digits, or 4 for Amex, and all digits, checked bytewise.
- **Ciphertext**: `len(ct) ≥ ns + overhead` before `ct[:ns]`. A corrupted or truncated stored record must return an error, not panic.
- **Keys**: exactly 32 bytes each, and the encryption and HMAC keys must differ (3.6.1), checked once at construction.
- **Mask**: guard `len ≤ 4` before slicing the last four.
- **Hoist** `n := len(pan)` and loop on the fixed array, which gives one bounds proof per loop.

## Pass by role

| Role | Signature (Go · Rust · C# · Java) |
|---|---|
| PAN, read-only | `func Tokenize(owner string, pan []byte, …)` · `pan: &[u8]` · `ReadOnlySpan<byte> pan` · `byte[] pan /* read-only */` |
| plaintext out, caller owns & wipes | `Detokenize(dst []byte, tok string) ([]byte, error)` · `fn detokenize(&self, dst: &mut Zeroizing<Vec<u8>>, …)` · `Span<byte> dst` · `byte[] dst` |
| non-sensitive card view | by value: brand, last 4, masked PAN, expiry. It holds no secrets, so copies are harmless. |
| keys, AEAD, HMAC | owned by the vault (`*Vault`, `&self`). Never returned, copied out or passed by value. |
| sensitive struct that might be logged | implements a masking `LogValue()` / `String()` / `Debug` / `ToString()` so an accidental `%v` prints `****1111`. |
| fingerprint / match key | `[32]byte` by value. It is small, fixed and comparable. |

Whoever owns a plaintext buffer wipes it: `defer clear(buf)` in the same scope that filled it. In Rust, `zeroize::Zeroizing`. In .NET, `CryptographicOperations.ZeroMemory`.

## Benchmarks

- Bench **tokenise, detokenise, mask, fingerprint, redact** separately with `-benchmem` (or JMH `-prof gc`, BenchmarkDotNet `[MemoryDiagnoser]`, criterion). Report ns/op, B/op, allocs/op.
- Profile before cutting: separate the crypto cost (fixed by the control) from conversions, hex, maps and copies (yours to cut).
- Redactor: bench three lines, one with no digits, one with a long non-PAN number (order ID, timestamp) and one with a PAN. Weight them by real log volume.
- **Never benchmark a password KDF to make it faster.** bcrypt, scrypt and Argon2 cost is the control (8.3.2). Tune parameters to policy, not to latency.
- Run the leak test and the crypto tests on every change. A faster vault that leaks one PAN is a breach, not a benchmark.

Go caveat: the GC can move or copy heap data, and `[]byte(str)` / `string(b)` make copies you can't wipe. Zeroing is best-effort: keep plaintext lifetimes short, and keep detokenisation rare or inside an HSM-backed service.

## Copy-and-destroy anti-patterns

| Anti-pattern | Fix |
|---|---|
| `Detokenize(...) (string, error)` → `string(pan)` | Open into the caller's `[]byte`, caller `defer clear(buf)` |
| `nonce := make([]byte, ns)` then `Seal(nonce, nonce, …)` | One `make([]byte, ns, ns+n+overhead)`; Seal appends in place |
| `hex.EncodeToString(mac.Sum(nil))` as map key | `var fp [32]byte; mac.Sum(fp[:0])`; `map[[32]byte]…` |
| `hmac.New(sha256.New, key)` per call | Pooled hasher, `Reset()` before each use |
| `aes.NewCipher` + `cipher.NewGCM` per request | Build the `AEAD` once in the constructor |
| `strings.Repeat("*", n-4) + last4` | Exact `[19]byte` scratch: fill `*`, copy the last 4 |
| `strings.NewReplacer(" ", "", "-", "")` per regex match in the redactor | Byte scan into a fixed `[19]byte`; regex only after the digit-run pre-check |
| `json.Unmarshal` into `map[string]any` | Capped body, strict struct decode |
| PAN parsed into `int64` / `BigInteger` | Digit bytes; Luhn over bytes |
| decrypted PAN cached "to avoid re-decrypting" | Detokenise on demand, audit each call; never cache plaintext |
| `pool.Put(buf)` with a PAN still inside | `clear(buf)` first |
| `log.Printf("%+v", req)` on a request holding PAN/CVV | Log the route, status and request ID only; masking `LogValue()` as a safety net |

## Never cut (payments)

These sit on top of the main never-cut list:

- **Every length from the client is untrusted**: the request body, the PAN digit count and CVV length are capped before any copy or allocation.
- **Money is integer minor units.** Never float, never a rounding step.
- **SAD is never stored after authorisation (3.3.1)**: no full track, CVV or PIN block in a cache, pool, log, audit row, error message, retry queue or metric label. "Temporarily for speed" is still stored.
- **Mask on display (3.4.1)**: at most BIN + last 4. The full PAN goes only to the need-to-know role, and every detokenisation is audited (10.2.1.1).
- **Crypto is not a line item to cut.** Never reuse a GCM nonce to skip `rand.Read`, never drop the AAD, never fall back to an unauthenticated or faster mode (ECB, CTR without a MAC), never shorten the tag.
- **Hashes stay keyed and slow where required.** PAN hashes are HMAC with a dedicated key (3.5.1.1), never plain SHA-256 for speed. Human passwords stay on a slow KDF (8.3.2).
- **Secrets are compared in constant time.** Never swap `subtle.ConstantTimeCompare` / `CryptographicOperations.FixedTimeEquals` for `==` or `bytes.Equal` to save nanoseconds.
- **Buffers that held a PAN, SAD or key are zeroed** before reuse, pooling or release. Views never outlive the buffer they point into.
- **No plaintext caching** of PANs or keys to skip a decrypt or KMS round trip.
- **Fixtures use test cards only**, and the leak test is never deleted or "updated to match" a faster path. If card data shows up in an output, the code is wrong.
