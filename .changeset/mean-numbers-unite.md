---
"@cloudflare/unenv-preset": patch
---

Use the native `node:process` v2 when it is available

Note that we only use v2 if workerd uses fixes for fetch iterable support.
See <https://github.com/cloudflare/workers-sdk/issues/12379> for details.

Note that EventEmitters (`on`, `off`, `addListener`, `removeListener`, ...) used to be available on the import while they should not have been. They are now only available on the global process:
