# Zig ledger sheet

Zig's std API changes between releases; the names below follow 0.14/0.15. Check `std` for the version in front of you.

## Containers & pre-allocation

| Size known… | Use | Notes |
|---|---|---|
| at compile time | `var a: [N]T = undefined;` | Stack, no allocator |
| before the loop, filling every slot | `const out = try allocator.alloc(T, n); defer allocator.free(out);` | One allocation; fill `out[i]` |
| push style | `var list = try std.ArrayList(T).initCapacity(allocator, n);` then `appendAssumeCapacity` | `appendAssumeCapacity` can't fail or grow. In 0.15 unmanaged lists take the allocator per call. |
| roughly | `try list.ensureTotalCapacity(allocator, est)` | Leave a `// yuuka:` comment. |
| bounded, no heap | `std.BoundedArray(T, N)` / a fixed buffer + `FixedBufferAllocator` | |
| many short-lived | `std.heap.ArenaAllocator`, freed once | |
| reusable scratch | `list.clearRetainingCapacity()` | |
| maps | `map.ensureTotalCapacity(n)` | |

Allocation is explicit: a function that allocates takes an `std.mem.Allocator`. That makes the cost visible at every call site.

## Letter vs number

- Strings are `[]const u8` (bytes). Use `std.unicode` only when you need code points.
- Use `enum(u8) { a, b, c }` instead of string tags, and `std.EnumArray(Kind, usize)` / `[@typeInfo(Kind).@"enum".fields.len]usize` counters.
- Width: arbitrary-width ints (`u7`, `i24`) and `packed struct` for dense data. `@intCast` checks in safe builds. Use `std.math.cast(T, x)` to get an optional instead of a panic, and `std.math.mul(i32, a, b)` (error on overflow) or `@mulWithOverflow`.
- Money: integer minor units. Never `f64`.

## Length checks

```zig
fn scale(allocator: std.mem.Allocator, xs: []const i32, k: i32) ![]i32 {
    if (xs.len == 0) return allocator.alloc(i32, 0);           // zero-length: no real allocation
    const out = try allocator.alloc(i32, xs.len);
    errdefer allocator.free(out);
    for (xs, out) |x, *o| o.* = try std.math.mul(i32, x, k);   // multi-object for: lengths asserted equal once
    return out;
}
```

- `for (a, b) |x, y|` asserts equal lengths once (in safe modes).
- Slicing `xs[a..b]` is bounds-checked in Debug/ReleaseSafe. Validate untrusted windows explicitly first.

## Pass by role

| Role | Signature |
|---|---|
| read-only | `[]const T`, `*const T` |
| write | `[]T`, `*T` |
| small value | By value. Zig may pass large by-value params by reference itself, but use `*const T` to make intent explicit. |
| ownership of an allocation | Return `[]T` plus document "caller frees with `allocator`", or take `*std.ArrayList(T)` to fill |

## Tests (TDD + alloc asserts)

```zig
test "scale empty" { const r = try scale(std.testing.allocator, &.{}, 3); try std.testing.expectEqual(@as(usize, 0), r.len); }
test "scale overflow" { try std.testing.expectError(error.Overflow, scale(std.testing.allocator, &.{std.math.maxInt(i32)}, 2)); }
```

- `std.testing.allocator` fails the test on leaks.
- `std.testing.FailingAllocator` (`fail_index`) proves the exact number of allocations and covers the error paths.

## Benchmarks

- `zig build -Doptimize=ReleaseFast`, with a `std.time.Timer` loop that reports ns/op against the goal (use `std.mem.doNotOptimizeAway(result)`).
- Libraries: `zBench`.
- Wrap the allocator in a counting allocator to report allocs/op.

## Copy-and-destroy anti-patterns

| Anti-pattern | Fix |
|---|---|
| `append` in a loop without capacity, n known | `initCapacity` + `appendAssumeCapacity` |
| `allocator.dupe` to read | Pass `[]const T` |
| `std.fmt.allocPrint` in a loop | One `ArrayList(u8)` + `writer().print` |
| per-iteration alloc/free | Arena, or reuse with `clearRetainingCapacity` |
| `@intCast` on untrusted input | `std.math.cast` + handle `null` |
