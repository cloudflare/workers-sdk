---
"wrangler": minor
---

fix: allow `require`ing aliased npm packages

Before this PR `require`ing NPM packages aliased in unenv would fail.
That's because `require` would load the mjs file.

This PR adds wraps the mjs file in a virtual ES module to allow `require`ing it.
