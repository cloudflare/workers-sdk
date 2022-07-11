---
"wrangler": patch
---

fix: don't crash cli on older versions of node

The entry point for the cli `./bin/wrangler.js` wasn't being transpiled, which meant that any newer syntax would cause it to crash on older versions of node. This is a problem because we need this script to run even on unsupported versions so we can log a message telling the user their version of node is too old. The fix here is to just transpile the entry point as well.

Fixes https://github.com/cloudflare/wrangler2/issues/1443
