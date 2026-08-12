---
"wrangler": patch
---

Fix spurious `Trailing comma jsonc(519)` warnings for `wrangler.jsonc` in VS Code 1.131+

The generated `config-schema.json` placed the `allowTrailingCommas` hint next to the schema's root `$ref`. VS Code 1.131 updated `vscode-json-languageservice` to a version that treats a draft-07 `$ref` as overriding its sibling keywords, so `allowTrailingCommas` was dropped during resolution and every trailing comma in a `wrangler.jsonc` was flagged, even though Wrangler itself parses those files fine. The root reference now sits inside an `allOf`, which keeps `allowTrailingCommas` on the root schema for both old and new versions of the language service.
