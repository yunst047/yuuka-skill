# Rust ledger sheet

## Containers & pre-allocation

| Size known… | Use | Notes |
|---|---|---|
| at compile time | `[T; N]` | Stack, `Copy` if `T: Copy`. Pass `&[T; N]` or `&arr[..]` for large N. |
| before the loop, filling every slot | `vec![init; n]`, or `Vec::with_capacity(n)` + `push` | `collect()` from an `ExactSizeIterator` (e.g. `xs.iter().map(f).collect()`) allocates exactly once. |
| fixed after construction | `Box<[T]>` (`vec.into_boxed_slice()`) | Drops the spare capacity word and excess memory. |
| roughly | `Vec::with_capacity(est)` / `v.reserve(k)` | Add a `// yuuka:` comment. `reserve_exact` only when you won't grow again. |
| small and usually tiny | `smallvec::SmallVec<[T; 8]>` / `arrayvec::ArrayVec` | Inline storage, no heap until it overflows. |
| maps / sets | `HashMap::with_capacity(n)` | |
| strings | `String::with_capacity(n)`, `write!` into it | |
| reusable scratch | `buf.clear()` keeps the capacity | Pass `&mut Vec<T>` into the hot function instead of returning a new one. |

## Letter vs number

- Use `&[u8]` / `Vec<u8>` / `bytes::Bytes` for ASCII or binary data. `str::as_bytes()` is free, `chars()` decodes UTF-8, and `s.len()` is bytes, not chars.
- Use `&str` / `Cow<'_, str>` for read-only text. Allocate a `String` only when you must own it.
- Use `enum Kind { A, B, C }` with `#[repr(u8)]` instead of string tags. `[usize; Kind::COUNT]` beats `HashMap<String, usize>`.
- Width: `u8`/`u16`/`u32` for bulk data. Use `usize` only for indices. Narrow with `u32::try_from(x)?`, never `as`, which silently truncates. Arithmetic: `checked_*` / `saturating_*`.
- Money: integer minor units (`i64`) or `rust_decimal::Decimal`. Never `f64`.

## Length checks

```rust
fn scale(xs: &[i32], k: i32, out: &mut [i32]) -> Result<(), Error> {
    if xs.is_empty() { return Ok(()); }
    let n = xs.len();
    let out = out.get_mut(..n).ok_or(Error::OutTooShort)?;  // one check; slices now same len
    for (o, &x) in out.iter_mut().zip(xs) { *o = x.checked_mul(k).ok_or(Error::Overflow)?; }
    Ok(())
}
```

Iterators (`iter`, `zip`, `chunks_exact`) eliminate bounds checks. With indexing, re-slice to the same length first (`let b = &b[..a.len()];`) or `assert_eq!(a.len(), b.len())` before the loop.

## Pass by role

| Role | Signature |
|---|---|
| read-only | `&[T]`, `&str`, `&T`. Accept the most general view: `&[T]` beats `&Vec<T>`, and `&str` beats `&String`. |
| write in place | `&mut [T]`, `&mut T`, or `&mut Vec<T>` if it must grow |
| small `Copy` value (≤ ~16 B) | By value: `fn f(p: Point)` |
| take ownership | `fn f(v: Vec<T>)`, with the caller moving in. No `.clone()` just to satisfy the borrow checker. Restructure first. |
| maybe-owned | `Cow<'a, [T]>` / `impl Into<String>` |

## Tests (TDD + alloc asserts)

```rust
#[test] fn scale_empty() { assert_eq!(scale_vec(&[], 3), Vec::<i32>::new()); }
#[test] fn scale_overflow() { assert!(scale(&[i32::MAX], 2, &mut [0]).is_err()); }
```

Alloc budget:
- `dhat` in testing mode, with `dhat::assert!(stats.total_blocks <= 1)`;
- or a counting `#[global_allocator]` in a test-only module;
- `allocation-counter` crate: `let n = allocation_counter::measure(|| f()).count_total; assert!(n <= 1);`.

## Benchmarks

`criterion`, in `benches/build.rs`:

```rust
c.bench_function("scale 10k", |b| b.iter(|| scale_vec(black_box(&xs), 3)));
```

- Run: `cargo bench`. criterion reports time per iteration with confidence intervals and the change versus the saved baseline (`--save-baseline before`, then `--baseline before`).
- `divan` gives allocation counts per benchmark (`#[divan::bench]` + `AllocProfiler`).
- Bench only `--release` builds.

## Copy-and-destroy anti-patterns

| Anti-pattern | Fix |
|---|---|
| `let mut v = Vec::new(); for … { v.push(x) }` with known n | `Vec::with_capacity(n)` or `iter().map().collect()` |
| `.clone()` to read | Borrow `&T` / `&[T]` |
| `s = s + &piece` / `format!` in a loop | `String::with_capacity` + `push_str` / `write!` |
| `.to_vec()` / `.collect::<Vec<_>>()` only to iterate again | Keep the iterator chain lazy |
| returning a new `Vec` from a hot fn each call | Take `&mut Vec<T>`, `clear()` and refill |
| `v.remove(0)` in a loop (O(n) shift) | `VecDeque`, or iterate and `drain(..)` |
| `x as u8` from wider ints | `u8::try_from(x)?` |
