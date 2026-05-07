---
"wrangler": patch
---

fix: hotkeys now work with Caps Lock enabled

Wrangler's dev server hotkeys (e.g. `b` to open browser, `x` to exit) were case-sensitive. When Caps Lock was on, Node.js `readline` emits `{ name: "a", shift: true }` instead of `{ name: "A", shift: false }`, causing the key matcher to build `"shift+b"` which did not match the registered `"b"` binding — silently ignoring the keypress.

When `shift` is the sole active modifier (no `ctrl` or `meta`), the key now also matches against the plain key name, so hotkeys respond correctly regardless of Caps Lock state.
