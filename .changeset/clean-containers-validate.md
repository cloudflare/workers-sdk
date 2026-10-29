---
"@cloudflare/config": patch
---

Validate Container relationships when parsing resolved input configurations

Share Container name and reference checks between configuration loading and validation of customized Vite plugin configuration. Reject duplicate Container names, references to missing Containers, and multiple Durable Objects linked to the same Container before development or build output generation.
