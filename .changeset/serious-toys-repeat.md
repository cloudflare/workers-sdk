---
"wrangler": minor
---

Reintroduces some internal refactorings of wrangler dev servers (including `wrangler dev`, `wrangler dev --remote`, and `unstable_dev()`).

These changes were released in 3.13.0 and reverted in 3.13.1 -- we believe the changes are now more stable and ready for release again.

There are no changes required for developers to opt-in. Improvements include:

- fewer 'address in use' errors upon reloads
- upon config/source file changes, requests are buffered to guarantee the response is from the new version of the Worker
