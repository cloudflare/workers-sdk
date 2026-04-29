---
"wrangler": minor
---

Add an experimental `unstable_generateTypes()` programmatic API.

Wrangler now exposes `unstable_generateTypes()` from the package root so you can generate Worker types in code using the same logic as `wrangler types`. The API supports the same core type-generation options (include env/runtime toggles) and returns structured output with separate `env` and `runtime` content alongside the combined formatted output.
