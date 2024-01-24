---
"wrangler": patch
---

fix: Cloudchamber command shows json error message on load account if --json specified

If the user specifies a json option, we should see a more detailed error on why `loadAccount` failed.
