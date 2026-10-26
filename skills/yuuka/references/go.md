# Go ledger sheet

## Containers & pre-allocation

| Size known… | Use | Notes |
|---|---|---|
| at compile time | `[N]T` array | Value type: lives on the stack if it doesn't escape. Copying it copies all N elements, so pass `*[N]T` or `arr[:]`. |
| before the loop, filling every slot | `s := make([]T, n)` then `s[i] = v` | One allocation, no `append` bookkeeping. |
| before the loop, filtering or maybe fewer | `s := make([]T, 0, n)` then `append` | `append` never regrows while `len < cap`. |
| roughly (an estimate) | `make([]T, 0, est)` | Leave a `// yuuka: cap from …` comment. |
| maps | `make(map[K]V, n)` | A size hint avoids rehash growth. |
| strings | `var b strings.Builder; b.Grow(n)` | `bytes.Buffer.Grow` for byte output. |
| reusable scratch | `buf = buf[:0]` | Keeps the capacity. Use `sync.Pool` for per-request buffers on hot servers. |

Tools: `slices.Grow(s, n)` (Go 1.21+) reserves for an existing slice, and `clear(m)` empties a map but keeps its buckets.

## Letter vs number

- Work on `[]byte` for ASCII or binary data. Each `string(b)` / `[]byte(s)` conversion allocates, unless the compiler proves it doesn't escape (map lookups `m[string(b)]` and comparisons are optimized).
- `for i, r := range s` decodes runes. For ASCII-only scanning, index with `s[i]` (a `byte`), which is cheaper.
- Use enums (`type Kind uint8` + `iota`) instead of string tags. A `[numKinds]int` array beats `map[string]int` for small, fixed key sets.
- Width: `uint8`/`int32` in large slices halve or quarter the memory against `int`. Keep `int` for indices and lengths. Check the range before narrowing: `if v > math.MaxInt32 { … }`.
- Money: `int64` minor units (cents), never `float64`.

## Length checks

```go
n := len(rows)
if n == 0 { return nil }          // guard before allocating or looping
out := make([]Out, n)
_ = rows[n-1]                     // BCE hint: one check, none inside the loop
for i := 0; i < n; i++ { out[i] = f(rows[i]) }

if len(a) != len(b) { return errMismatch } // paired loops: check once
b = b[:len(a)]                              // lets the compiler drop b[i] checks
```

To see which bounds checks remain: `go build -gcflags='-d=ssa/check_bce/debug=1'`.

## Pass by role

| Role | Signature |
|---|---|
| read-only slice | `func f(xs []T)`. The header (ptr, len, cap = 24 B) is copied, not the data. Document "does not modify". |
| write elements in place | `func f(xs []T)`, writing through `xs[i]`. |
| grow or replace the slice | Return it: `func f(xs []T) []T`. A callee `append` is invisible to the caller otherwise. |
| small immutable struct (≤ ~3 words) | By value: `func f(p Point)`. |
| large struct (≳ 64 B) read in hot paths | `func f(r *Row)`. Mark read-only intent in the doc comment. |
| mutate a struct | Pointer receiver or parameter: `func (s *Stats) Add(...)`. |

Ranging over large elements copies each one: `for _, r := range rows`. Use `for i := range rows { r := &rows[i] … }` instead.

## Tests (TDD + alloc asserts)

```go
func TestBuild_Empty(t *testing.T) { if got := Build(nil); len(got) != 0 { t.Fatal(got) } }

func TestBuild_Allocs(t *testing.T) {
    rows := fixture(10_000)
    if a := testing.AllocsPerRun(100, func() { _ = Build(rows) }); a > 1 {
        t.Fatalf("allocs/op = %v, budget 1", a)
    }
}
```

Use table-driven tests for empty, one element, exactly cap, and overflow. Run them with `go test ./...`, and they must fail first.

## Benchmarks

```go
func BenchmarkBuild(b *testing.B) {
    rows := fixture(10_000)
    b.ReportAllocs()
    for b.Loop() { _ = Build(rows) }   // Go 1.24+; older: for i := 0; i < b.N; i++
}
```

- Run: `go test -bench=Build -benchmem -count=10 > new.txt`
- Compare: `benchstat old.txt new.txt`

Read `ns/op` against the goal, `B/op` for bytes, and `allocs/op` for the alloc budget. The goal is met when the benchstat delta is significant and `ns/op` ≤ goal.

## Copy-and-destroy anti-patterns

| Anti-pattern | Fix |
|---|---|
| `var out []T; for … { out = append(out, x) }` with a known n | `make([]T, 0, n)` or `make([]T, n)` + index |
| `s += piece` in a loop | `strings.Builder` + `Grow` |
| `append([]T{}, src...)` to "copy" every call | Copy only if you must own it: `slices.Clone` once |
| `for _, big := range bigs` | `for i := range bigs { p := &bigs[i] }` |
| new `make` per request in a hot handler | Reuse `buf[:0]` or a `sync.Pool` |
| `map[string]bool` for a small fixed set | `[N]bool` by enum, or a bitmask |
| sub-slice of a huge buffer kept alive forever | `slices.Clone` the small part so the big one can be freed |
