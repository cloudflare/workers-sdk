---
"wrangler": patch
"@cloudflare/deploy-helpers": patch
---

Fix asset uploads to properly skip symbolic links

Previously, symbolic links in your assets directory were followed and their targets were uploaded as assets. Now symbolic links are correctly skipped during asset uploads.

