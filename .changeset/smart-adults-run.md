---
"wrangler": minor
---

Add Pages detection to autoconfig flows

When running the autoconfig logic (via `wrangler setup`, `wrangler deploy --x-autoconfig`, or the programmatic autoconfig API), Wrangler now detects when a project appears to be a Pages project and handles it appropriately:

- For `wrangler deploy`, it warns the user but still allows them to proceed
- For `wrangler setup` and the programmatic autoconfig API, it throws a fatal error
