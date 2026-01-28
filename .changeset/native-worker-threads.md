---
"@cloudflare/unenv-preset": minor
---

Add support for native `node:worker_threads` module from workerd when the `enable_nodejs_worker_threads_module` compatibility flag is enabled. This experimental feature provides the workerd implementation of worker_threads which uses native Web API MessageChannel/MessagePort and throws proper Node.js-style errors for unsupported operations like Worker and BroadcastChannel constructors.

To enable this experimental feature, add the compatibility flag to your wrangler configuration:

```json
{
  "compatibility_flags": ["enable_nodejs_worker_threads_module"]
}
```
