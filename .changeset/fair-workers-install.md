---
"@cloudflare/autoconfig": minor
---

Pre-approve esbuild and workerd builds when autoconfig installs dependencies with pnpm

Autoconfig updates the nearest pnpm workspace after setup confirmation, before installation. Existing build decisions remain unchanged, and dry runs do not write build approvals.
