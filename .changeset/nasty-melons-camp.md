---
"wrangler": minor
---

fix: allow `require`ing unenv aliased packages

Before this PR `require`ing packages aliased in unenv would fail.
That's because `require` would load the mjs file.

This PR adds wraps the mjs file in a virtual ES module to allow `require`ing it.
