---
"wrangler": patch
---

fix: wrangler deploy dry run should not require you to be logged in

Fixes a bug where if you had a container where the image was an image registry link, dry run would require you to be logged in.
Also fixes a bug where container deployments were not respecting `account_id` set in Wrangler config.
