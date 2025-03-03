---
"@cloudflare/vitest-pool-workers": patch
---

Added step-through debugging support with Vitest.

To start debugging, run Vitest with the following command and attach a debugger to port 9229:

```sh
vitest --inspect=9229 --no-file-parallelism
```

For more details, check out our [Vitest Debugging guide](https://developers.cloudflare.com/workers/testing/vitest-integration/debugging).
