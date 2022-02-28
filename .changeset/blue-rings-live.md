---
"wrangler": patch
---

feat: implement `rules` config field

This implements the top level `rules` configuration field. It lets you specify transport rules for non-js modules. For example, you can specify `*.md` files to be included as a text file with -

```
[[rules]]
{type = "Text", globs = ["**/*.md"]}
```

We also include a default ruleset -

```
  { type: "Text", globs: ["**/*.txt", "**/*.html"] },
  { type: "Data", globs: ["**/*.bin"] },
  { type: "CompiledWasm", globs: ["**/*.wasm"] },
```

More info at https://developers.cloudflare.com/workers/cli-wrangler/configuration/#build.

Known issues -

- non-wasm module types do not work in `--local` mode
- `Data` type does not work in service worker format, in either mode
