---
"@cloudflare/deploy-helpers": patch
"wrangler": patch
---

Fetch script metadata directly instead of listing all scripts

When resolving Durable Object migrations, fetch the specific script's service metadata via `/workers/services/{name}` instead of listing all scripts in the account via `/workers/scripts`. This avoids downloading metadata for every Worker in the account just to find one script's migration tag.
