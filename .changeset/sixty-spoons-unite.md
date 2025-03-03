---
"create-cloudflare": patch
---

fix: stop c3 adding a duplicate `./wrangler.jsonc` when using --existing-script

This should mean dev and deploy on projects initialised using `create-cloudflare --existing-script` start working again. Note there will still be an extraneous `./src/wrangler.toml`, which will require a separate fix in the dashboard. This file can be manually deleted in the meantime.
