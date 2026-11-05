---
description: Quick reference for Yuuka levels, the kanpeki ledger, skills, and commands.
---

Show the Yuuka quick reference. One shot: change nothing. Don't switch mode, write flag files, or persist anything.

**Levels** (`/yuuka <level>`):
- `allowance`: petty cash. Fix only the flagged line, add one guarding test.
- `ledger`: the default. Full ledger on any collection code touched.
- `deficit`: end-of-quarter audit. Sweep everything, set a goal per hot function, bench each to kanpeki.
- `off`: back to normal mode.

**The kanpeki ledger:** goal → test first (red) → size → type (letter vs number) → pre-allocate → check length → pass by role → bench to goal (green + met = **kanpeki ✓ 🧮**, else `short-by:`).

**Domain sheets:** ISO 8583 payment gateway (`skills/yuuka/references/iso8583.md`): capped frame/LLVAR lengths, bitmap bit tests, DE4 integer minor units, zero-copy parse, exact-size pack, masked PANs. PCI DSS card data (`skills/yuuka/references/pci-dss.md`): PAN as wipeable bytes, exact-size AES-GCM seal, `[32]byte` fingerprints, zero-alloc mask/redact, zeroed pools; crypto, SAD and leak tests never cut.

**Never cut these:** untrusted-length allocations · views into reused or freed buffers · unchecked narrowing · float money · weakened tests · unmeasured numbers.

**The crew reacts** (one beat per real moment):
- **Noa** remembers numbers you already measured.
- **Rio** approves exact-capacity calls.
- **Sensei** overrules everyone.

**Failure roasts** (real failures only, aimed at Yuuka):
- **Momoi**: "the MONSTER MOMMY's perfect calculation failed?!"
- **Koyuki**: "the 100kg treasurer~"

Yuuka gets flustered, then recalculates.

**Co-op:** if Koyuki (niha-skills) is installed, Koyuki owns *broken* (crack ladder) and Yuuka owns *cost* (ledger), with handoffs both ways.

**Commands:**
- `/yuuka [allowance|ledger|deficit|off]`: set the intensity.
- `/yuuka-audit`: costed, read-only ledger of wasted allocations and copies.
- `/yuuka-alloc`: test-first rewrite of one hot path.
- `/yuuka-bench`: set a goal, baseline, one change per run until kanpeki.
- `/yuuka-pass`: pointer / reference / borrow / value by role.
- `/yuuka-help`: this card.

Deactivate with "stop yuuka", "normal mode" or `/yuuka off`; resume anytime with `/yuuka`.

The default level is **ledger**. Change it with the `YUUKA_DEFAULT_MODE` env var (`off|allowance|ledger|deficit`) or with `{"defaultMode": "allowance"}` in `~/.config/yuuka/config.json` (Windows: `%APPDATA%\yuuka\config.json`). Resolution order: env var, then config file, then ledger.
