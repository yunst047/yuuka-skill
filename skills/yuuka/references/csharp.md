# C# / .NET ledger sheet

## Containers & pre-allocation

| Size known… | Use | Notes |
|---|---|---|
| tiny, at compile time | `Span<T> s = stackalloc T[N];` | Stack only, no GC. Keep N small (≲ 1 KB). |
| before the loop, filling every slot | `var a = new T[n];` / `GC.AllocateUninitializedArray<T>(n)` for large primitive arrays you fully overwrite | |
| before the loop, push style | `new List<T>(n)` | `CollectionsMarshal.SetCount` + `AsSpan` for the fastest fill. |
| roughly | `new List<T>(est)`, `list.EnsureCapacity(k)` | Leave a `// yuuka:` comment. |
| maps | `new Dictionary<K,V>(n)`, `EnsureCapacity` | |
| strings | `new StringBuilder(n)`, `string.Create(n, state, (span, st) => …)` | |
| reusable scratch | `ArrayPool<T>.Shared.Rent(n)` … `Return` in `finally` | The rented array may be *longer* than n, so track the length yourself. |
| immutable lookup table | `FrozenDictionary` / `ImmutableArray<T>` | |

## Letter vs number

- Use `ReadOnlySpan<char>` / `ReadOnlyMemory<char>` for read-only text slices. `s.AsSpan(a, len)` doesn't copy, but `Substring` does.
- Use `ReadOnlySpan<byte>` / `"abc"u8` literals for UTF-8 bytes. Work in bytes for protocols and parsing.
- Use `enum Kind : byte` instead of string tags, and `int[]` indexed by `(int)kind` instead of `Dictionary<string,int>`.
- **Avoid boxing:** generic `List<int>` doesn't box, but `object`, non-generic collections and `IComparable` on structs do.
- Width: `byte`/`short`/`int` arrays for bulk data. Use `checked(…)` or `int.CreateChecked(x)` when narrowing.
- Money: `decimal` or `long` minor units. Never `double`.

## Length checks

```csharp
static int[] Scale(ReadOnlySpan<int> xs, int k)
{
    if (xs.IsEmpty) return [];
    var result = new int[xs.Length];
    for (int i = 0; i < xs.Length; i++) result[i] = checked(xs[i] * k);
    return result;
}
```

- The JIT elides bounds checks for `for (int i = 0; i < span.Length; i++)` over the same span or array.
- For paired spans, re-slice once: `b = b[..a.Length];` (it throws if b is too short), and then both checks go away.
- Validate windows with `ArgumentOutOfRangeException.ThrowIfGreaterThan(end, xs.Length)`.

## Pass by role

| Role | Signature |
|---|---|
| read-only contiguous | `ReadOnlySpan<T>` (sync) / `ReadOnlyMemory<T>` (async, fields) |
| read-only collection | `IReadOnlyList<T>`. Don't `.ToList()` it. |
| write / fill | `Span<T>` / `Memory<T>` / `out T` |
| large struct, read-only | `in T` or `ref readonly T`; make the struct `readonly struct` to avoid defensive copies |
| mutate a struct | `ref T` |
| small struct (≤ 16 B) / class reference | By value |

Never store a `Span<T>` in a field (it's a `ref struct`). Never return a span over a pooled array after `Return`.

## Tests (TDD + alloc asserts)

- xUnit/NUnit: `[Fact] public void Empty() => Assert.Empty(Scale([], 3));` and `Assert.Throws<OverflowException>(…)`.
- Alloc budget: read `long before = GC.GetAllocatedBytesForCurrentThread();` after warm-up, then `Assert.True(after - before <= budget)`.

## Benchmarks

BenchmarkDotNet:

```csharp
[MemoryDiagnoser]
public class ScaleBench {
    int[] xs = Fixture(10_000);
    [Benchmark] public int[] Scale() => Program.Scale(xs, 3);
}
```

- Run in Release with `dotnet run -c Release`.
- Read `Mean` (ns) against the goal, and `Allocated` (B/op) / `Gen0` against the alloc budget.
- Use `[Baseline = true]` on the old version for a ratio column.

## Copy-and-destroy anti-patterns

| Anti-pattern | Fix |
|---|---|
| `new List<T>()` + n `Add`s, n known | `new List<T>(n)` or `new T[n]` |
| `s += piece` in a loop | `StringBuilder(n)` / `string.Create` |
| `str.Substring(…)` to parse | `AsSpan(…)` + `int.Parse(ReadOnlySpan<char>)` |
| LINQ `.Where().Select().ToList()` in a hot path | Plain loop into a sized array or span |
| `.ToArray()` / `.ToList()` just to iterate or count | Iterate directly, or `TryGetNonEnumeratedCount` |
| `new byte[n]` per request | `ArrayPool<byte>.Shared` |
| large struct passed by value in a hot loop | `in` / `ref readonly` + `readonly struct` |
