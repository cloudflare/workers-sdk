---
"create-cloudflare": patch
---

fix: c3, use latest types for `@cloudflare/workers-types`

We have some code that looks for the latest compat date generated in a workers-types dist, but that's been frozen for 202307-01 forever. We have upcoming work that'll replace this with generated types based on compat date/flags, but till then let's generate new projects with the default types.
