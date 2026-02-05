---
"@cloudflare/unenv-preset": patch
---

Use the native `node:process` v2 when it is available

Note that we only enable this if all of the following conditions are met:

- compatibility_date >= 2025-09-15 or process v2 enabled by flag (enable_nodejs_process_v2)
- `fetch_iterable_type_support` and `fetch_iterable_type_support_override_adjustment` are active (explicitly specified or implied by date or other flags).

Note that EventEmitters (`on`, `off`, `addListener`, `removeListener`, ...) used to be available on the import while they should not have been. They are now only available on the global process:

```ts
import p from "node:process";

// Working before this PR, not working after this PR
p.on("exit", exitHandler);

// Use the global process instead (works before and after the PR)
process.on("exit", exitHandler);
```
