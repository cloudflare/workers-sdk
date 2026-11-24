---
"@cloudflare/workers-auth": minor
---

Add a user-level "global active profile" to the profile store

`ProfileStore` gains a `global` accessor (`use()`, `get()`, `read()`, `write()`) and a `resolveWithSource()` method that reports where a resolved profile came from (`flag`, `env`, `directory`, `global`, or `default`). The global profile is persisted as `active_profile` in the shared `preferences.json` and is consulted after directory bindings and before falling back to `default`. `createProfileStore()` accepts an optional `global` storage; without it the previous behaviour is unchanged.
