---
"@cloudflare/vite-plugin": patch
---

Support React development stack reconstruction in the Vite module runner

Use the runner's existing local code evaluation binding for indirect eval. This prevents React Flight from reporting unsupported eval during development, including cached Server Component rendering. Deployed Workers keep their existing eval restrictions.
