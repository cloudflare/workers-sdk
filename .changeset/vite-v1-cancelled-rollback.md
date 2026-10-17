---
"@cloudflare/vite-plugin": patch
---

Keep cancelled Wrangler rollbacks from reporting a successful deployment

The bundled Wrangler release now stops after declining the changed-secrets confirmation, without printing a success message or a new current version. The compatible Wrangler dependency is supplied by the earlier remote-token retry backport.
