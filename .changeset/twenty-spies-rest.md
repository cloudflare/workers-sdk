---
"@cloudflare/workers-utils": minor
"wrangler": minor
---

Introducing the `cache` configuration option for Workers.

You can now set `{ cache: { enabled: true } }` in your Wrangler configuration file to enable a HTTP cache in front of your Worker's `fetch` handler. This is also supported in `[previews]` configuration — `previews.cache` overrides the top-level `cache` setting for preview deployments, and falls back to the top-level value when absent. More information can be found in [our documentation](https://developers.cloudflare.com/workers/cache/configuration/).
