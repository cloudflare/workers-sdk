---
"wrangler": patch
---

fix: ensure `wrangler dev` can reload without crashing when importing `node:*` modules

The previous Wrangler release introduced a regression that caused reloads to fail when importing `node:*` modules. This change fixes that, and ensures these modules can always be resolved.
