---
"wrangler": patch
---

fix: wrangler publish for CI after a manual deployment

Prior to this change, if you edited your Worker via the Cloudflare Dashboard, then used CI to deploy your script, `wrangler publish` would fail.

This change logs a warning that your manual changes are going to be overriden, but doesn't require user input to proceed.
