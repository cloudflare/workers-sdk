---
"create-cloudflare": patch
---

Updates the Nuxt template by adding a `env.d.ts` file which updates the type difinition for `H3EventContext` to include the `cf` property from the request and an `env` type generated from the recently added `build-cf-types` script.
