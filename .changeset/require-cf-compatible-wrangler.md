---
"@cloudflare/codemods": minor
---

Require Wrangler 4.136.0 or newer when migrating to Wrangler tooling configuration

The experimental cf migration now checks for Wrangler's delegate and build integration, rather than only the experimental config export. Incompatible installations are rejected before writing configuration or installing dependencies, including during dry runs; migrations without Wrangler tooling output are unaffected.
