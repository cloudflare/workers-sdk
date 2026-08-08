---
"@cloudflare/workers-utils": patch
---

Report malformed container SSH keys and a null `containers.configuration` as config errors instead of crashing

Validation of a `containers` entry recorded a type error and then dereferenced the value it had just rejected. An `authorized_keys` or `trusted_user_ca_keys` entry whose `public_key` was missing or was not a string reached `key.public_key.toLowerCase()` and threw `TypeError: Cannot read properties of undefined (reading 'toLowerCase')`, and an entry that was not an object at all threw from the `in` operator inside `hasProperty`. Separately, `configuration: null` passed the `typeof value !== "object"` check, because `typeof null === "object"`, and later threw from `Object.keys()`. Because none of these are a `UserError`, wrangler printed a stack trace and asked the user to file a bug rather than naming the offending key.

Each check now gates the ones that depend on it, so all of these produce an ordinary diagnostic such as `containers.authorized_keys[0].public_key must be a string`. The two duplicated key-validation blocks are now a single shared helper, and no existing error message changed.
