---
"wrangler": patch
---

fix: with`wrangler init`, test for existence of `package.json`/ `tsconfig.json` / `.git` in the right locations

When running `wrangler.init`, we look for the existence of `package.json`, / `tsconfig.json` / `.git` when deciding whether we should create them ourselves or not. Because `name` can be a relative path, we had a bug where we don't starting look from the right directory. We also had a bug where we weren't even testing for the existence of the `.git` directory correctly. This patch fixes that initial starting location, tests for `.git` as a directory, and correctly decides when to create those files.
