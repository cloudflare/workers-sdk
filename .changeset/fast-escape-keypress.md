---
"wrangler": patch
---

Add `escapeCodeTimeout` option to `onKeyPress` utility for faster Esc key detection

The `onKeyPress` utility now accepts an optional `escapeCodeTimeout` parameter that controls how long readline waits to disambiguate a standalone Esc press from multi-byte escape sequences (e.g. arrow keys). The default remains readline's built-in 500ms, but callers can pass a lower value (e.g. 25ms) for near-instant Esc handling in interactive prompts.
