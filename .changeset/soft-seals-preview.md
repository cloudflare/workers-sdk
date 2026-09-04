---
"wrangler": patch
---

Honor Workers Builds name overrides in `wrangler preview`

Preview commands now target the Worker name supplied by Workers Builds instead of the name in local Wrangler configuration. This prevents preview builds from failing when the two names differ.
