# JavaScript / TypeScript ledger sheet

## Containers & pre-allocation

| Size known… | Use | Notes |
|---|---|---|
| numeric, before the loop | `new Int32Array(n)` / `Float64Array` / `Uint8Array` | One contiguous, zero-filled, unboxed buffer. Fixed length. |
| objects, before the loop | `const out = new Array(n)` then `out[i] = …` (fill **every** index, in order) | Or `Array.from({ length: n }, f)`. Holes make arrays slow ("holey"), so never leave gaps. |
| unknown, push style | `const out = []; out.push(x)` | V8 grows it amortized. That's fine; the anti-pattern is the *copy per iteration*, not `push`. |
| strings | Collect into an array and `join('')` once, or `+=` for a few pieces (V8 ropes are fine for modest sizes) | |
| bytes | `Buffer.allocUnsafe(n)` (Node, when you overwrite every byte) / `new Uint8Array(n)` | |
| reusable scratch | Keep one typed array and use a `len` counter; `arr.length = 0` to reuse a JS array | Grow typed arrays ×2 with `.set()` into a bigger one. |
| maps | `new Map()` (no capacity API). Prefer an array indexed by small ints | |

## Letter vs number

- Use `charCodeAt(i)` / `codePointAt` numeric codes instead of `str[i]` / `split('')`, which create 1-char strings and an array.
- Use `TextEncoder().encode(s)` → `Uint8Array` to work on bytes. Decode once at the end.
- Use number enums (`const enum Kind { A, B }` in TS, or frozen int constants) and `Uint32Array(kindCount)` counters instead of string-keyed objects for fixed sets.
- Width: a typed array element type is the width (`Uint8Array` 1 B vs a JS array of numbers at ~8 B+). Typed arrays **silently wrap or clamp** on store, so range-check first: `(r | 0) === r` for int32.
- BigInt is slow and allocates. Use it only when the range needs > 2^53.
- Money: integer minor units, or a decimal lib. Never raw floats.

## Length checks

```js
function scale(xs, k) {
  const n = xs.length;                       // hoisted once
  if (n === 0) return new Int32Array(0);
  const out = new Int32Array(n);             // one exact allocation
  for (let i = 0; i < n; i++) {
    const r = xs[i] * k;
    if ((r | 0) !== r) throw new RangeError(`scale overflow at ${i}`);
    out[i] = r;
  }
  return out;
}
```

- Out-of-bounds reads return `undefined` silently (and deoptimize). Validate windows once: `if (start < 0 || end > n || start > end) throw new RangeError(…)`.
- For paired arrays, check `a.length === b.length` once.

## Pass by role

JS passes object references. The choice is copy versus view, and `readonly` types document intent.

| Role | Do |
|---|---|
| read-only array | TS `readonly T[]` / `ReadonlyArray<T>`. Don't `[...xs]` or `xs.slice()` to read. |
| read-only window | `typed.subarray(a, b)` (view) or index `a..b` directly. `slice()` **copies**, both on arrays and typed arrays. |
| write / out | Pass the target typed array in and fill it (`fn(src, dst)`) |
| immutable value | `Object.freeze` only at the boundary. TS `Readonly<T>` / `as const` for zero-cost intent. |

## Tests (TDD + alloc asserts)

- `node:test` + `assert/strict` (no deps), Vitest or Jest: empty, one, exact length, overflow → `RangeError`.
- Budget tests: assert the output *type* and *byte length* (`out.buffer.byteLength === n * 4`, which means no over-allocation).
- "No copy" test: pass a subclass whose `slice`/`map` throw.
- Heap delta (rough): `global.gc()` under `--expose-gc`, then compare `process.memoryUsage().heapUsed` before and after many calls.

## Benchmarks

- Node: a `process.hrtime.bigint()` loop with warm-up, reporting ns/op against `GOAL_NS_PER_OP`. See [examples/js/bench.js](../../../examples/js/bench.js) in this repo.
- Libraries: `mitata` / `tinybench` (report ops/s, p75/p99), Vitest `bench`.
- Watch GC with `node --trace-gc`, and profile with `--cpu-prof`.
- Bench the same input sizes as production. JIT tiers change the results below ~1k iterations.

## Copy-and-destroy anti-patterns

| Anti-pattern | Fix |
|---|---|
| `acc = [...acc, x]` / `reduce((a, x) => [...a, x], [])` (O(n²)) | `push`, or a preallocated array or typed array |
| `{ ...obj, [k]: v }` in a loop | Mutate a local accumulator, freeze at the end if needed |
| `arr.concat([x])` per iteration | `push` |
| `str.split('')` / `[...str]` to scan | `charCodeAt` loop |
| `.map().filter().map()` chains on big arrays | One loop into a preallocated output |
| `xs.slice(a, b).reduce(…)` | Index loop over `a..b` / `subarray` |
| `JSON.parse(JSON.stringify(x))` to copy | `structuredClone` only if you must own it, otherwise don't copy |
