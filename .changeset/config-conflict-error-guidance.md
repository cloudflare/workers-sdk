---
"@cloudflare/workers-utils": patch
"wrangler": patch
---

Improve guidance for conflicting Wrangler configuration files

When user and generated deploy configurations are found under different base paths, Wrangler now identifies the expected deploy configuration location, suggests how to resolve the conflict, and links to the relevant documentation.
