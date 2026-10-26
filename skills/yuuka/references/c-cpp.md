# C / C++ ledger sheet

## Containers & pre-allocation

| Size known… | C++ | C |
|---|---|---|
| at compile time | `std::array<T, N>` | `T a[N]` |
| before the loop, filling every slot | `std::vector<T> v(n);` + `v[i] = …` | `T *a = malloc(n * sizeof *a)` (check overflow of `n * sizeof`, check NULL) |
| before the loop, push style | `v.reserve(n);` + `emplace_back(…)` | Track `len`/`cap` and grow ×2 only when full |
| fixed after construction | `std::unique_ptr<T[]>(new T[n])` or a sized `vector` | |
| small, usually tiny | `boost::container::small_vector<T, 8>` / `absl::InlinedVector` | Fixed stack buffer + heap fallback |
| maps | `unordered_map::reserve(n)` | |
| strings | `std::string s; s.reserve(n);` | `snprintf` into a sized buffer |
| reusable scratch | `v.clear()` keeps the capacity, `shrink_to_fit` only when done | Reuse the same `malloc`'d buffer |

`std::pmr::monotonic_buffer_resource` / arena allocators suit many short-lived allocations that are freed together.

## Letter vs number

- Use `std::string_view` / `std::span<const std::byte>` / `const char*` + length for read-only text. Never `std::string` by value just to read.
- Use `unsigned char` / `std::uint8_t` for bytes. `char` signedness is implementation-defined.
- Use `enum class Kind : std::uint8_t` instead of string tags, and `std::array<int, kKindCount>` instead of `map<string,int>`.
- Width: `<cstdint>` fixed types (`int32_t`, `uint16_t`) in bulk data, `size_t` for sizes and indices. Signed overflow is UB: check with `__builtin_mul_overflow` / `ckd_mul` (C23) before narrowing or multiplying.
- Money: `int64_t` minor units or a decimal library. Never `double`.

## Length checks

```cpp
std::vector<int32_t> scale(std::span<const int32_t> xs, int32_t k) {
    if (xs.empty()) return {};
    const size_t n = xs.size();          // hoisted
    std::vector<int32_t> out(n);         // one allocation
    for (size_t i = 0; i < n; ++i) {
        int32_t r;
        if (__builtin_mul_overflow(xs[i], k, &r)) throw std::overflow_error("scale");
        out[i] = r;
    }
    return out;                          // NRVO / move, no copy
}
```

- For paired arrays, check `a.size() == b.size()` once before the loop.
- `v.at(i)` checks on every call. Use it only on cold or untrusted paths; prefer validated `[]` in hot loops.
- In C, validate `n` against `SIZE_MAX / sizeof *a` before `malloc`.

## Pass by role

| Role | Signature |
|---|---|
| read-only, contiguous | `std::span<const T>` (C++20) / `const std::vector<T>&`; C: `const T *a, size_t n` |
| read-only string | `std::string_view` (by value, 2 words) |
| read-only large object | `const T&` |
| write / out param | `std::span<T>`, `T&`; C: `T *out, size_t n` |
| small trivially-copyable (≤ ~16 B) | By value |
| sink / take ownership | By value + `std::move` at the call site, or `T&&` |

Never return a `span`/`string_view`/pointer into a local or a vector that may reallocate.

## Tests (TDD + alloc asserts)

- GoogleTest/Catch2: `TEST(Scale, Empty) { EXPECT_TRUE(scale({}, 3).empty()); }`, plus tests for overflow and exactly-n.
- Alloc budget: replace global `operator new` in the test binary with a counting one and `EXPECT_LE(g_allocs, 1)` around the call. In C, wrap `malloc` with `--wrap=malloc` (GNU ld) or a test shim.
- Run the suite under `-fsanitize=address,undefined` to catch overflow and dangling views.

## Benchmarks

Google Benchmark:

```cpp
static void BM_Scale(benchmark::State& s) {
    auto xs = fixture(10000);
    for (auto _ : s) benchmark::DoNotOptimize(scale(xs, 3));
}
BENCHMARK(BM_Scale);
```

- Build with `-O2`/`-O3`. Report `Time` (ns) against the goal.
- Compare runs with `tools/compare.py benchmarks old.json new.json`.
- For allocations, use `heaptrack` / `valgrind --tool=massif`, or the counting `operator new`.

## Copy-and-destroy anti-patterns

| Anti-pattern | Fix |
|---|---|
| `push_back` n times without `reserve` | `reserve(n)` or size-construct |
| `void f(std::vector<T> v)` that only reads | `std::span<const T>` / `const&` |
| `for (auto x : bigs)` | `for (const auto& x : bigs)` |
| `s = s + piece` in a loop | `s.reserve(total); s += piece;` / `std::format_to` |
| `push_back(T(args))` | `emplace_back(args)` |
| returning `std::move(local)` | Plain `return local;` (lets NRVO work) |
| `realloc` by +1 each append (C) | Geometric growth (×2) |
