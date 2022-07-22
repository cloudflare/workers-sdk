---
"wrangler": patch
---

fix: don't log version spam in tests

Currently in tests, we see a bunch of logspam from yargs about "version" being a reserved word, this patch removes that spam.
