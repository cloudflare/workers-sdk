---
"@cloudflare/unenv-preset": patch
---

Drop `node:process` polyfill when v2 is available

Note that EventEmitters (`on`, `off`, `addListener`, `removeListener`, ...) used to be available on the import while they should not have been. They are now only available on the global process:

```
import p from "node:process";

// Working before this PR, not working after this PR
p.on("exit", exitHandler);

// Use the global process instead (works before and after the PR)
process.on("exit", exitHandler);
```
