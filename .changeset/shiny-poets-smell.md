---
"wrangler": minor
---

fix: change `wrangler (pages) dev` to listen on `localhost` by default

Previously, Wrangler listened on all interfaces (`*`) by default. This change switches `wrangler (pages) dev` to just listen on local interfaces. Whilst this is technically a breaking change, we've decided the security benefits outweigh the potential disruption caused. If you need to access your dev server from another device on your network, you can use `wrangler (pages) dev --ip *` to restore the previous behaviour.
