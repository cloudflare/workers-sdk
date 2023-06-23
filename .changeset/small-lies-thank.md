---
"create-cloudflare": patch
---

fix: use a valid compatibility date for worker templates

Previously, we changed wrangler.toml to use the current date for the
compatibility_date setting in wrangler.toml when generating workers.
But this is almost always going to be too recent and results in a warning.

Now we look up the most recent compatibility date via npm on the workerd
package and use that instead.

Fixes https://github.com/cloudflare/workers-sdk/issues/2385
