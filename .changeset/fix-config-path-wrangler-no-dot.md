---
"@cloudflare/workers-utils": patch
"create-cloudflare": patch
"miniflare": patch
"wrangler": patch
---

Fix global Wrangler config directory name to use `wrangler` instead of `.wrangler` (removes the unintended hidden-directory effect on XDG-compliant systems). Existing config data is automatically migrated. Note: users who had the Browser Rendering Chromium binary cached under the old path may need to re-download it.
