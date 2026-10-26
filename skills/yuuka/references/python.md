# Python ledger sheet

## Containers & pre-allocation

| Size known… | Use | Notes |
|---|---|---|
| before the loop, filling every slot | `out = [None] * n` then `out[i] = …` | Or a comprehension `[f(x) for x in xs]`, which is sized internally and is usually fastest in pure Python. |
| numeric bulk data | `array.array('i', [0]) * n` / `numpy.empty(n, dtype=np.int32)` | Unboxed, contiguous, and 4–8× smaller than a list of ints. |
| bytes | `bytearray(n)` / `memoryview(buf)` | `b''.join(parts)` once at the end. |
| strings | Collect parts then `''.join(parts)` once; `io.StringIO` for streams | |
| NumPy results | `np.empty(n)` + `out=` arguments (`np.multiply(a, k, out=dst)`) | No temporary arrays. |
| reusable scratch | `buf.clear()` / `del buf[:]`; NumPy: reuse `dst` with `out=` | |
| dict | No capacity API. Build with a comprehension or `dict.fromkeys(keys, 0)` | |

## Letter vs number

- Use `bytes`/`bytearray`/`memoryview` for ASCII or binary data. `str` is Unicode and `.encode()`/`.decode()` copy.
- Every Python `int` and `float` in a list is a boxed object (~28 B + 8 B pointer). Numeric bulk data belongs in `array` / NumPy with an explicit `dtype`.
- Use `enum.IntEnum` or small-int constants instead of string tags. Use a list or `array` indexed by int instead of `dict[str, int]` for a fixed key set.
- Width (NumPy): pick the dtype by proven range (`np.int32`, `np.uint8`). NumPy silently wraps on overflow, so check with `np.iinfo` bounds or use `np.int64` when unsure.
- Money: `decimal.Decimal` or `int` cents. Never `float`.

## Length checks

```python
def scale(xs: Sequence[int], k: int) -> array:
    n = len(xs)
    if n == 0:
        return array('i')
    out = array('i', [0]) * n                 # one exact allocation, C-int storage
    for i in range(n):
        out[i] = xs[i] * k                    # OverflowError if it leaves int32 range
    return out
```

- Hoist `len()` and attribute lookups (`append = out.append`) out of hot loops.
- Check `len(a) == len(b)` once, or use `zip(a, b, strict=True)` (3.10+).
- Validate window bounds once instead of relying on slicing silently clamping.

## Pass by role

Python passes object references, so the choice is copy versus view.

| Role | Do |
|---|---|
| read-only sequence | Accept `Sequence[T]` / `Iterable[T]`. Don't `list(xs)` it. |
| read-only window | `memoryview(buf)[a:b]` (no copy) / NumPy slices `a[i:j]` (views). Plain `list[a:b]` / `bytes[a:b]` **copy**. Iterate `range(a, b)` over the original instead. |
| write / out | Pass the target in (`out: bytearray`, NumPy `out=`) and fill it |
| immutable value | `tuple`, `@dataclass(frozen=True, slots=True)` (`slots` saves the per-instance `__dict__`) |

## Tests (TDD + alloc asserts)

- pytest: `def test_empty(): assert list(scale([], 3)) == []`, `with pytest.raises(OverflowError): …`.
- Alloc budget with `tracemalloc`:

```python
tracemalloc.start(); scale(xs, 3)  # warm-up
snap1 = tracemalloc.take_snapshot(); out = scale(xs, 3); snap2 = tracemalloc.take_snapshot()
assert sum(s.size_diff for s in snap2.compare_to(snap1, 'lineno')) <= budget_bytes
```

- `pytest-memray`'s `@pytest.mark.limit_memory("1 MB")` is a simpler budget assert.

## Benchmarks

- `python -m timeit -s "from m import scale, xs" "scale(xs, 3)"` reports per-loop time against the goal.
- `pytest-benchmark`: `def test_bench(benchmark): benchmark(scale, xs, 3)`. Use `--benchmark-compare` against the saved baseline.
- `pyperf` for stable numbers (it spawns workers and calibrates).
- Profile memory with `memray run`. Check CPU hotspots first with `cProfile` / `py-spy`.

## Copy-and-destroy anti-patterns

| Anti-pattern | Fix |
|---|---|
| `out = out + [x]` in a loop (new list each time) | `out.append(x)` or a comprehension |
| `s += piece` for many pieces | `''.join(parts)` |
| `list(range(n))` / `list(xs)` just to iterate | Iterate directly |
| `data[i:j]` slices in a loop over big bytes or lists | `memoryview` / index ranges |
| list of floats or ints for numeric work | `array` / NumPy with dtype |
| `np.append` / `np.concatenate` per iteration | Preallocate `np.empty(n)` and fill, or collect then concatenate once |
| `a = a * k` on NumPy (new array) when `a` is yours | `a *= k` / `np.multiply(a, k, out=a)` |
