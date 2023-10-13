---
"wrangler": minor
---

Simplify secret:bulk api via script settings

Firing PUTs to the secret api in parallel has never been a great solution - each request independently needs to lock the script, so running in parallel is at best just as bad as running serially.

Luckily, we have the script settings PATCH api now, which can update the settings for a script (including secret bindings) at once, which means we don't need any parallelization. However this api doesn't work with a partial list of bindings, so we have to fetch the current bindings and merge in with the new secrets before PATCHing. We can however just omit the value of the binding (i.e. only provide the name and type) which instructs the config service to inherit the existing value, which simplifies this as well. Note that we don't use the bindings in your current wrangler.toml, as you could be in a draft state, and it makes sense as a user that a bulk secrets update won't update anything else. Instead, we use script settings api again to fetch the current state of your bindings.

This simplified implementation means the operation can only fail or succeed, rather than succeeding in updating some secrets but failing for others. In order to not introduce breaking changes for logging output, the language around "${x} secrets were updated" or "${x} secrets failed" is kept, even if it doesn't make much sense anymore.
