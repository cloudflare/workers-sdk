---
"@cloudflare/unenv-preset": minor
---

Add support for native `node:worker_threads` module from workerd when the `enable_nodejs_worker_threads_module` compatibility flag is enabled.

To enable this experimental feature, add the compatibility flags to your wrangler configuration:

```json
{
	"compatibility_flags": ["enable_nodejs_worker_threads_module", "experimental"]
}
```
