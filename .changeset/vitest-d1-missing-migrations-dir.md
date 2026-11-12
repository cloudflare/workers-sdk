---
"@cloudflare/vitest-plugin": patch
---

Throw from `readD1Migrations()` when the migrations directory doesn't exist

Passing options with a missing `migrationsDir` used to return no migrations, so a typo silently applied nothing. It now throws "No migrations present at …", as Wrangler does. Passing a directory path that doesn't exist throws the same error.
