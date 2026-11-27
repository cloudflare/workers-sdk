---
"@cloudflare/autoconfig": patch
"@cloudflare/codemods": patch
---

Only ask about a Wrangler assets directory that Vite won't deploy

Migrating to the Vite bundler always left a required TODO for `assets.directory`, although Vite deploys its build output and public folder. The TODO now only appears for another folder, and says how to make Vite deploy it.
