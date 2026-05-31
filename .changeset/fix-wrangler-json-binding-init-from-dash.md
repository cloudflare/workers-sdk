---
"wrangler": patch
---

Fix JSON variable bindings in `wrangler init --from-dash` and remote config diff

When fetching a remote Worker's configuration, JSON variable bindings (e.g. `{"my_value": 5}`) were incorrectly serialized as `{ "name": "MY_JSON", "json": {"my_value": 5} }` instead of `{ "MY_JSON": {"my_value": 5} }`. This affected two areas:

- `wrangler init --from-dash` would generate a `wrangler.json` with broken `vars` entries
- Remote config diff checks would always report JSON bindings as changed, since the malformed remote representation could never match the local config

Both issues are now fixed and remote JSON bindings are now correctly mapped.
