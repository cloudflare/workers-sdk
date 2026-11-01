---
"create-cloudflare": patch
---

Keep the compatibility date in generated vinext Cloudflare projects within the workerd version supported by C3.

When create-vinext-app selects today's date ahead of the bundled runtime, local development fails to start. C3 now uses its supported workerd date for those generated configurations while preserving earlier dates, and removes Node.js compatibility flags that the supported date enables by default.
