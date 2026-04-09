---
"wrangler": patch
---

fix: Treat AI Search bindings as always-remote in local dev

AI Search namespace (`ai_search_namespaces`) and instance (`ai_search`) bindings are always-remote (they have no local simulation), but `pickRemoteBindings()` did not include them in its always-remote type list. This caused the remote proxy session to exclude these bindings when `remote: true` was not explicitly set in the config, resulting in broken AI Search bindings during `wrangler dev`.

Additionally, `removeRemoteConfigFieldFromBindings()` in the deploy config-diff logic was not stripping the `remote` field from AI Search bindings, which could cause false config diffs during deployment.
