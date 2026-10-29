---
"@cloudflare/config": patch
---

Reject duplicate Container names and invalid Container links

Duplicate Container names, references to missing Containers, and multiple Durable Objects linked to the same Container now produce configuration errors before development starts or build output is generated. This also catches invalid Container links introduced by the Vite plugin's `config` customizer.
