<h1 align="center">Yuuka</h1>

<p align="center">
  <em>She writes the goal before the code. She writes the test before the fix. She measures before she gloats. Kanpeki. 🧮</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/mode-kanpeki%20ledger-4a6cf7?style=flat-square" alt="Kanpeki ledger mode">
  <img src="https://img.shields.io/badge/license-MIT-111111?style=flat-square" alt="MIT license">
  <img src="https://img.shields.io/badge/fan%20project-Blue%20Archive-3aa0ff?style=flat-square" alt="Blue Archive fan project">
  <img src="https://img.shields.io/badge/co--op-Koyuki%20(niha--skills)-ff69b4?style=flat-square" alt="Co-op with Koyuki">
</p>

---

You know the loop. `acc = [...acc, x]` inside a `reduce`. It passed review because it "looks functional". At 2,000 elements it makes 2,000 throwaway arrays and two million element copies. Then Seminar's treasurer opens the ledger.

**Yuuka** puts Hayase Yuuka, Blue Archive's sleep-deprived Seminar treasurer, inside your AI agent. Wasted memory is wasted budget, and she audits both. She never optimizes by vibes. She **calculates**: a number before the change, a test before the code, a measurement after. When every line balances, she says it: **kanpeki** (完璧).

It's a sister plugin to [Koyuki (niha-skills)](https://github.com/yunst047/niha-skills). Koyuki cracks what's *broken*; Yuuka balances what's *expensive*. Install both and they [split the work](#co-op-with-koyuki).

## How it works: the kanpeki ledger

```
1. Goal.          → write the number first: ≤ X ns/op · ≤ N allocs/op at size n.
2. Test first.    → behaviour + alloc-budget tests. Red, then green. No test, no kanpeki.
3. Size it.       → known at compile time / before the loop / bounded / unknown → container.
4. Type it.       → letter vs number: bytes over chars, int IDs over strings, narrowest proven width.
5. Pre-allocate.  → one capacity call before the loop. No grow → copy → free per iteration.
6. Check length.  → early return on empty, hoist len, paired lengths once, bounds-check idiom.
7. Pass by role.  → read-only → borrow/view · write → mutable ref · small → value · owned → move.
8. Bench to goal. → one change per run until met (kanpeki ✓) or an honest short-by.
```

The ledger has per-language sheets for **Go, Rust, C/C++, Java/Kotlin, C#, Python, JS/TS, Swift and Zig**. Each covers containers and capacity APIs, letter vs number types, length idioms, signatures by role, test and alloc-assert tooling, benchmark tooling, and copy-and-destroy anti-patterns. See [skills/yuuka/references/](skills/yuuka/references/).

It also has a **domain sheet** for **ISO 8583 payment gateways** ([iso8583.md](skills/yuuka/references/iso8583.md)), which walks the same rungs for card-message switches:

- frame and LLVAR/LLLVAR caps from the dialect spec;
- a spec table indexed by DE number, with bitmaps as bytes;
- DE4 as integer minor units;
- zero-copy parse into a reused message, and exact-size pack;
- request/response matching keys and timeout reversals;
- PCI-safe logging.

A second domain sheet covers **PCI DSS card-data handling** ([pci-dss.md](skills/yuuka/references/pci-dss.md)):

- the PAN as wipeable digit bytes, never a string or `int64`;
- AES-GCM sealed into one exact-size buffer, with the AEAD and HMAC built once;
- `[32]byte` fingerprint keys, and masking and log redaction into fixed scratch buffers with no allocations;
- pooled buffers zeroed before reuse;
- a never-cut list for crypto, SAD, masking, constant-time compares and the leak test.

**Never cut these:**
- no allocation sized from an untrusted length without a cap;
- no views into reused or freed buffers;
- no unchecked narrowing;
- no float money;
- no weakened tests;
- no unmeasured numbers.

### Failure roasts

On a *real* failure (a red test, a missed goal, a regression) the room roasts Yuuka once. Then she's flustered, and then she's back to calculating:

> `(Momoi: the MONSTER MOMMY's perfect calculation FAILED?! Midori, screenshot it!!)` → *"I-I'm not a monster! …re-running the numbers."*
>
> `(Koyuki: nihaha~ the ledger's heavier than the 100kg treasurer herself~)` → *"It is NOT 100kg!!! …recalculating."*

Noa remembers what you already measured. Rio approves exact-capacity calls. Sensei overrules everyone.

## Install

The Claude Code plugin runs two small Node.js lifecycle hooks, so `node` needs to be on your PATH. Without it, the skills and commands still work; only the always-on activation stays quiet.

### Claude Code

```
/plugin marketplace add yunst047/yuuka-skill
/plugin install yuuka@yuuka
```

Then start a new session. On `SessionStart` the persona activates at the default level (**ledger**). The `UserPromptSubmit` hook tracks `/yuuka` switches. An optional statusline badge shows the active mode (`[YUUKA:LEDGER]`), and the plugin offers to set it up on first run.

### Any repo, without the marketplace

```bash
node bin/yuuka-install.js /path/to/repo      # copies skills/commands into .claude/, merges hooks
node bin/yuuka-install.js /path/to/repo -u   # removes only what it added
```

The installer is idempotent. It only touches `yuuka*` entries, so a co-installed Koyuki keeps her skills, commands and hooks.

### Other agents (always-on rules)

[`AGENTS.md`](AGENTS.md) is the compact, portable persona and ledger. Codex (`~/.codex/AGENTS.md`), OpenCode and any agent that reads `AGENTS.md` pick it up. For Cursor, Windsurf, Cline or Copilot, copy it into that tool's rules file.

## Commands

| Command | What it does |
|---------|--------------|
| `/yuuka [allowance \| ledger \| deficit \| off]` | Set the intensity, or turn it off. No argument uses the default. |
| `/yuuka-audit` | Costed, **read-only** ledger of wasted allocations, copies, unchecked lengths and wrong signatures. |
| `/yuuka-alloc` | **Test-first** rewrite of one hot loop or builder: right container, pre-allocated, typed, length-checked. |
| `/yuuka-bench` | Set a runtime **goal**, baseline, one change per run until **kanpeki ✓** or an honest `short-by:`. |
| `/yuuka-pass` | Pointer / reference / borrow / view / value for each signature, by role. |
| `/yuuka-help` | Quick reference. |

### Intensity levels

| Level | Budget |
|-------|--------|
| `allowance` | Petty cash. Fix only the flagged line, add one guarding test, state the saving. |
| `ledger` | **Default.** The full ledger on any collection code touched. |
| `deficit` | End-of-quarter audit. Sweep everything in scope, set a goal per hot function, bench each one to kanpeki. |
| `off` | Normal mode. |

Set the default for every session with the `YUUKA_DEFAULT_MODE` env var (`off`/`allowance`/`ledger`/`deficit`) or a `defaultMode` field in `~/.config/yuuka/config.json` (`%APPDATA%\yuuka\config.json` on Windows).

## Co-op with Koyuki

If [niha-skills](https://github.com/yunst047/niha-skills) is on the machine, the SessionStart hook detects it and adds a co-op contract. Detection looks for her active flag, plugin registry entries, the plugin cache, or a user- or project-level `koyuki` skill.

- **Koyuki owns broken.** Unexpected test failures, crashes and opaque errors go through her crack ladder.
- **Yuuka owns cost.** Allocations, types, lengths, signatures, goals and benchmarks go through the ledger.
- **Handoffs.** A red test that fails for the *wrong* reason goes to Koyuki first. Once Koyuki's fix is proven, Yuuka audits it for new allocations.
- **One voice per beat.** Both "never" lists always apply.

The statusline shows both: `[YUUKA:LEDGER|KOYUKI:NIHAHA]`.

## Proof: the kanpeki demo

[`examples/js/`](examples/js/) has three naive/kanpeki pairs, one for each rule, with behaviour and budget tests written first:

| Pair | Naive line item | Kanpeki fix |
|------|-----------------|-------------|
| `scale` | `reduce((acc, v) => [...acc, v * k], [])` (O(n²) copies) | One `Int32Array(n)`, length guard, int32 overflow refused |
| `letterHistogram` | `split('')` + string-keyed `Map` | `charCodeAt` codes into one `Uint32Array(26)` |
| `sumWindow` | `slice(a, b).reduce(…)` (copies to read) | Read-only index loop, bounds validated once |
| `iso8583.parse` | Frame → string, `"0101…"` bitmap string, string-keyed fields | Bit tests on bytes, `(offset, len)` views into the frame, reused message, every length capped |
| `iso8583.pack` | `s += prefix + value`, bit-string bitmap, two more copies | Size in pass 1, one exact `Uint8Array`, write in pass 2 |

`npm run bench` declares the goals before measuring and exits non-zero on a miss. Naive and kanpeki samples are **interleaved**, so laptop clock shifts can't skew the speedup. Here is one run on a Ryzen 7 7735U with Node 24 (5/5 runs met every goal):

```
case             n       goal                   naive      kanpeki    speedup  verdict
scale            2000    ≤ 60.0 µs, ≥ 100x      5.96 ms    12.5 µs    475.3x   kanpeki ✓
letterHistogram  10000   ≤ 300.0 µs, ≥ 3x       278.5 µs   49.8 µs    5.6x     kanpeki ✓
sumWindow        100000  ≤ 600.0 µs, ≥ 10x      2.65 ms    96.4 µs    27.5x    kanpeki ✓
iso8583.parse    343     ≤ 1.5 µs, ≥ 4x         4.1 µs     483 ns     8.4x     kanpeki ✓
iso8583.pack     104     ≤ 4.0 µs, ≥ 3x         9.3 µs     1.9 µs     5.0x     kanpeki ✓
```

The ISO 8583 rows come from a later run on the same machine (Node 24.19). Their goals were set from 5 baseline runs, not guessed. One probe failed: swapping `TypedArray#set` for a byte loop in pack didn't change the numbers, so it was reverted. About 610 ns of pack is its one output allocation, kept on purpose because a reused buffer would alias while `socket.write` still holds it.

**What went wrong first, and why it's in the README:**
- The first draft guessed its goals (15/60/150 µs) *before* measuring, and missed all three. Momoi had a field day.
- The second draft measured the two versions in separate time windows. A CPU clock drop made the histogram speedup read 2.99x against a 3x goal.

The fix in both cases was the measurement, never the threshold. That is the ledger working as intended.

```bash
npm test         # 74 tests: hooks, installer, co-op detection, content lint, demo behaviour/budget
npm run bench    # goal-checked benchmark
```

## License & attribution

Code is [MIT](LICENSE). **Hayase Yuuka**, **Saiba Momoi**, **Kurosaki Koyuki**, **Ushio Noa**, **Tsukatsuki Rio** and **Blue Archive** are © NEXON Games / Yostar. This is an unofficial, non-commercial fan project and ships no game art. See [CREDITS.md](CREDITS.md).
