# Swift ledger sheet

## Containers & pre-allocation

| Size known… | Use | Notes |
|---|---|---|
| before the loop, filling every slot | `Array(repeating: 0, count: n)` / `Array(unsafeUninitializedCapacity: n) { buf, count in …; count = n }` | The unsafe initializer skips the zero-fill. Every slot must be initialized. |
| push style | `var out = [T](); out.reserveCapacity(n)` | |
| roughly | `reserveCapacity(est)` | Leave a `// yuuka:` comment. |
| fixed size, inline (Swift 6.2+) | `InlineArray<N, T>` | No heap allocation. |
| dictionaries / sets | `Dictionary(minimumCapacity: n)` / `reserveCapacity` | |
| strings | `var s = ""; s.reserveCapacity(n)` | |
| reusable scratch | `buf.removeAll(keepingCapacity: true)` | |
| bytes | `[UInt8]` with `reserveCapacity`, `Data(capacity:)` | |

Arrays are copy-on-write: a "copy" is free until one side mutates, and then the whole buffer is copied. Avoid mutating a shared array inside a loop.

## Letter vs number

- Use `s.utf8` (a `String.UTF8View` of `UInt8`) for ASCII or byte scanning. `Character` iteration does grapheme breaking and is expensive.
- Use `Substring` (a view) for read-only slices. Convert to `String` only when storing long-term.
- Use `enum Kind: UInt8` instead of string tags, and `[Int](repeating: 0, count: Kind.allCases.count)` counters instead of `[String: Int]`.
- Width: `UInt8`/`Int32` arrays for bulk data. Swift traps on overflow by default (good). Use `Int32(exactly:)` to narrow safely. `&*` wraps, so only use it on purpose.
- Money: `Decimal` or `Int` minor units. Never `Double`.

## Length checks

```swift
func scale(_ xs: [Int32], by k: Int32) throws -> [Int32] {   // read-only param: CoW, no copy
    let n = xs.count
    guard n > 0 else { return [] }
    var out = [Int32](); out.reserveCapacity(n)
    for x in xs {
        let (r, overflow) = x.multipliedReportingOverflow(by: k)
        guard !overflow else { throw ScaleError.overflow }
        out.append(r)
    }
    return out
}
```

- `for x in xs` and `indices` loops avoid repeated bounds checks.
- For paired arrays, `precondition(a.count == b.count)` once, or `zip(a, b)`.
- `withUnsafeBufferPointer` removes checks in proven-hot loops. Use it only behind a length check, and leave a `// yuuka:` comment.

## Pass by role

| Role | Signature |
|---|---|
| read-only | Plain parameter (immutable, CoW, no copy) or `borrowing` (Swift 5.9+) for noncopyable or explicit intent; `ArraySlice` / `Substring` / `UnsafeBufferPointer` for views |
| write in place | `inout [T]`, `inout T` (no copy if uniquely referenced) |
| take ownership | `consuming` parameter |
| small value type | By value (structs are values) |
| large struct, shared, mutated by many | Consider a `final class`, or CoW-box the storage |

## Tests (TDD + alloc asserts)

- XCTest / Swift Testing: `#expect(try scale([], by: 3).isEmpty)`, `#expect(throws: ScaleError.overflow) { … }`.
- Alloc budget: Instruments Allocations, or `XCTMemoryMetric` in `measure(metrics:)`. For counts, test against `malloc_zone_statistics` deltas on Apple platforms.

## Benchmarks

- `package-benchmark` (ordo-one): `Benchmark("scale") { b in for _ in b.scaledIterations { blackHole(try scale(xs, by: 3)) } }`. It reports wall time and **mallocs** per iteration, with thresholds that fail CI.
- XCTest `measure { }` for rough numbers.
- Always build `-c release`.

## Copy-and-destroy anti-patterns

| Anti-pattern | Fix |
|---|---|
| `out = out + [x]` / `out += [x]` (temp array) | `out.append(x)` after `reserveCapacity` |
| `Array(xs[a..<b])` just to read | Use the `ArraySlice` directly |
| `for ch in str` for ASCII parsing | `for b in str.utf8` |
| mutating an array copy held elsewhere (CoW triggers a full copy) | Keep a unique owner, `inout` |
| `map` then `filter` then `map` on big arrays | One loop, or `lazy` |
