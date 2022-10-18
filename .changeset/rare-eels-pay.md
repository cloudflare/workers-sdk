---
"wrangler": patch
---

feat: implement a basic `wrangler delete`

This PR adds a simple (but useful!) implementation for `wrangler delete`. Of note, it'll delete a given service, including all it's bindings. It uses the same api as the dashboard.
