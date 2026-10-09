---
"create-cloudflare": minor
---

Support projects configured with `cloudflare.config.ts` and the `cf` CLI

Framework generators can now scaffold projects that use `cloudflare.config.ts` and the `cf` CLI in place of a Wrangler configuration file. C3 detects these projects and installs `cf` instead of Wrangler, logs in and selects accounts with `cf`, and looks up the deployed Worker's URL with `cf`. Projects that use Wrangler are unaffected.
