---
"@cloudflare/vitest-pool-workers": patch
---

Added step-through debugging support with Vitest.

You can now debug your workers tests by running `vitest --inspect --no-file-parallelism`. This opens an inspector on port 9229 by default, allowing you to step through your code with a `debugger` statement when a debugger is attached.

For more details, check out our [Vitest Debugging guide](https://developers.cloudflare.com/workers/testing/vitest-integration/debugging).
