---
"@cloudflare/unenv-preset": patch
"wrangler": patch
---

chore: update unenv to 2.0.0-rc.0

Pull a couple changes in node:timers

- unjs/unenv#384 fix function bindings in node:timer
- unjs/unenv#385 implement active and \_unrefActive in node:timer

The unenv update also includes #unjs/unenv/381 which implements
`stdout`, `stderr` and `stdin` of `node:process` with `node:tty`
