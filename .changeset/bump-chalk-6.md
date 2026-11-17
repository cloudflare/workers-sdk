---
"wrangler": patch
"@cloudflare/workers-utils": patch
"@cloudflare/cli-shared-helpers": patch
"@cloudflare/deploy-helpers": patch
"@cloudflare/autoconfig": patch
---

Bump `chalk` to 6.0.1

This matches the version used by the `cf` CLI. Chalk 6 requires Node.js 22, which all supported Wrangler versions already require, and improves performance. See the [release notes](https://github.com/chalk/chalk/releases/tag/v6.0.0) for details.
