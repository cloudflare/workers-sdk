---
"wrangler": minor
---

Refactoring the internals of wrangler dev servers (including `wrangler dev`, `wrangler dev --remote` and `unstable_dev()`).

There are no changes required for developers to opt-in. Improvements include:

- fewer 'address in use' errors upon reloads
- upon config/source file changes, requests are buffered to guarantee the response is from the new version of the Worker
