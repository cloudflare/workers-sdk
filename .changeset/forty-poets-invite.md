---
"wrangler": patch
---

fix: only send durable object migrations when required

We had a bug where even if you'd published a script with migrations, we would still send a blank set of migrations on the next round. The api doesn't accept this, so the fix is to not do so. I also expanded test coverage for migrations.

Fixes https://github.com/cloudflare/wrangler2/issues/705
