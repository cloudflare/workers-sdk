---
"@cloudflare/unenv-preset": patch
---

Use the native `node:process` v2 when it is available

Note that we only use v2 if workerd uses fixes for fetch iterable support.
See <https://github.com/cloudflare/workers-sdk/issues/12379> for details.

Note that EventEmitters (`on`, `off`, `addListener`, `removeListener`, ...) used to be available on the import while they should not have been. They are now only available on the global process:

```ts
import p from "node:process";

// Working before this PR, not working after this PR
p.on("exit", exitHandler);

// Use the global process instead (works before and after the PR)
process.on("exit", exitHandler);
```
