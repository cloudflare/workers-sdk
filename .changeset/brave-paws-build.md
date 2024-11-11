---
"wrangler": patch
---

Turn on `wrangler.json(c)` support by default

Wrangler now supports both JSON (`wrangler.json`) and TOML (`wrangler.toml`) for it's configuration file. The format of Wrangler's configuration file is exactly the same across both languages, except that the syntax is `JSON` rather than `TOML`. e.g.

```toml
name = "worker-ts"
main = "src/index.ts"
compatibility_date = "2023-05-04"
```

would be interpreted the same as the equivalent JSON

```json
{
  "name": "worker-ts",
  "main": "src/index.ts",
  "compatibility_date": "2023-05-04"
}
```
