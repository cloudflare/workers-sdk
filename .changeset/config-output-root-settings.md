---
"@cloudflare/config": minor
---

Nest settings under an optional `settings` and add an optional `producer` in `BuildOutputRootConfigSchema`

The root `config.json` in Build Output v1 has the shape `{ producer?, settings?, buildContext }`. `settings` holds the account settings from `cloudflare.config.ts`, is validated strictly, and is left out when none are set. `producer` is `{ name, version }` for the tool that wrote the output and is used only in diagnostics. The new `BuildOutputProducerSchema` and `ParsedBuildOutputProducer` are also exported.
