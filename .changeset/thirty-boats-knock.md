---
"wrangler": minor
---

feat: update `wrangler deploy` to use the new versions and deployments API.
This should have zero user-facing impact but sets up the most used command to deploy Workers to use the new recommended APIs and move away from the old ones.
We will still call the old upload path where required (e.g. Durable Object migration or Service Worker format).
