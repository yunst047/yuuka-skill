# Java / Kotlin ledger sheet

## Containers & pre-allocation

| Size known… | Java | Kotlin |
|---|---|---|
| fixed, primitives | `int[] a = new int[n]` | `IntArray(n)` / `IntArray(n) { i -> … }` |
| fixed, objects | `T[]` / `new ArrayList<>(n)` | `Array<T>(n) { … }` / `ArrayList<T>(n)` |
| before the loop, push style | `new ArrayList<>(n)` | `ArrayList<T>(n)` / `buildList(n) { … }` |
| roughly | `new ArrayList<>(est)`, `ensureCapacity(k)` | Same |
| maps | `HashMap.newHashMap(n)` (Java 19+); older: `new HashMap<>((int)(n / 0.75f) + 1)` | `HashMap<K,V>(n)`: the arg is *capacity*, so apply the same load-factor rule |
| strings | `new StringBuilder(n)` | `buildString(n) { … }` / `StringBuilder(n)` |
| reusable scratch | `sb.setLength(0)`, `list.clear()` | Same |
| bytes | `ByteBuffer.allocate(n)` / `allocateDirect` for I/O | `ByteArray(n)` |

`ArrayList()` with no arg starts at 10 and grows ×1.5, copying the backing array each time.

## Letter vs number

- **Avoid boxing.** `List<Integer>` stores pointers to `Integer` objects (~16 B each plus a 4–8 B reference). Use `int[]` / `IntArray`, or `IntStream` / fastutil / Eclipse Collections primitive lists.
- Kotlin `List<Int>` and `Array<Int>` box. Use `IntArray`, `LongArray`, `ByteArray`.
- Use `byte[]` for ASCII or binary data. `String` (with compact strings) is Latin-1 internally but immutable: every `+` makes a new one.
- Use `enum` + `EnumMap` / `EnumSet` (array- or bit-backed) instead of string keys. `ordinal()` indexes an `int[]`.
- Width: `int` by default, `short`/`byte` arrays for bulk data, `Math.multiplyExact` / `Math.toIntExact` to narrow safely.
- Money: `long` minor units or `BigDecimal`. Never `double`.

## Length checks

```java
static int[] scale(int[] xs, int k) {
    final int n = xs.length;
    if (n == 0) return EMPTY;            // shared static final empty array
    int[] out = new int[n];
    for (int i = 0; i < n; i++) out[i] = Math.multiplyExact(xs[i], k);
    return out;
}
```

The JIT removes bounds checks on canonical `for (int i = 0; i < a.length; i++)` loops. Keep loops in that shape. `Objects.checkFromToIndex(from, to, n)` validates a window once. For paired arrays, check `a.length == b.length` up front.

## Pass by role

Java passes object references by value, so there is no pointer-vs-value choice for objects. The choice is copy versus view and mutable versus read-only.

| Role | Do |
|---|---|
| read-only collection | Accept `List<T>` / `Collection<T>` and don't copy. Return `Collections.unmodifiableList(list)` (a view, O(1)) instead of `List.copyOf` (a copy, O(n)) when the backing data is yours and stable. |
| read-only window | `list.subList(a, b)` / `CharBuffer.wrap(s, a, b)` / `ByteBuffer.slice()`. These are views, not copies. |
| write / out | Pass the target array or list in and fill it. Avoid returning a fresh one per call in hot loops. |
| immutable value | `record Point(int x, int y)` / Kotlin `data class`; `@JvmInline value class` for one-field wrappers (no box). |
| defensive copy | Only at trust boundaries (constructor of an immutable type), once. |

Kotlin: `List<T>` is a read-only *view* type. Avoid `.toList()` / `.toMutableList()` copies unless you need ownership. `asSequence()` avoids intermediate lists in long `map`/`filter` chains.

## Tests (TDD + alloc asserts)

- JUnit 5: `@Test void empty() { assertArrayEquals(new int[0], scale(new int[0], 3)); }`, `assertThrows(ArithmeticException.class, …)` for overflow.
- Alloc budget: `((com.sun.management.ThreadMXBean) ManagementFactory.getThreadMXBean()).getCurrentThreadAllocatedBytes()` before and after the call, after warm-up. Assert ≤ the budget in bytes.
- Kotlin: `kotlin.test` / JUnit, same pattern.

## Benchmarks

JMH, the only trustworthy JVM micro-benchmark:

```java
@Benchmark @BenchmarkMode(Mode.AverageTime) @OutputTimeUnit(TimeUnit.NANOSECONDS)
public int[] scale(State s) { return Scale.scale(s.xs, 3); }
```

- Run with `-prof gc` to get `gc.alloc.rate.norm` (bytes/op) as the alloc budget.
- Kotlin: `kotlinx-benchmark` (JMH-backed).
- Never benchmark with `System.nanoTime` loops without warm-up.

## Copy-and-destroy anti-patterns

| Anti-pattern | Fix |
|---|---|
| `new ArrayList<>()` + n `add`s, n known | `new ArrayList<>(n)` or `int[n]` |
| `List<Integer>` for numeric data | `int[]` / `IntArray` |
| `s += piece` in a loop | `StringBuilder(n)` |
| `stream().map(..).collect(toList())` then another stream | Chain once, or a plain loop into a sized array |
| `list.toArray()` / `List.copyOf` just to read | Iterate the list directly |
| `HashMap<String, …>` keyed by a fixed set | `EnumMap` / `int[]` by ordinal |
| Kotlin `list + x` in a loop (new list each time) | `ArrayList(n)` + `add`, or `buildList` |
