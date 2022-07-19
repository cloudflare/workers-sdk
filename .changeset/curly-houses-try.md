---
"wrangler": patch
---

feat: change version command to give update information
When running version command, we want to display update information if current version is not up to date. Achieved by replacing default output with the wrangler banner.
Previous behaviour (just outputting current version) reamins when !isTTY.
Version command changed from inbuilt .version() from yargs, to a regular command to allow for asynchronous behaviour.

Implements https://github.com/cloudflare/wrangler2/issues/1492
