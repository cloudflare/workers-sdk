---
"@cloudflare/autoconfig": minor
---

Expose mode support for autoconfigured framework commands

Autoconfig details and summaries now describe resolved build and development commands as an executable and argument vector, together with whether each command supports `--mode`. Astro and Vite commands report mode support, while other framework commands remain unsupported unless configured individually. Summaries also expose whether Vite or Wrangler owns the Cloudflare-aware build step.
