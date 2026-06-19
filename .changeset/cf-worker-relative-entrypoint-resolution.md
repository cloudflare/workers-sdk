---
"@cloudflare/vite-plugin": patch
"wrangler": patch
---

Resolve relative `cf-worker` entrypoint imports relative to the importing module

When loading the experimental `cloudflare.config.ts`, a relative entrypoint imported with `import ... with { type: "cf-worker" }` (e.g. `./src/index.ts`) is now anchored to the module where the import is written, rather than being passed through verbatim and later resolved against the top-level config file. This fixes incorrect resolution when the import lives in a file other than the entry config — for example a config that re-exports from a nested file.

Bare specifiers (such as `@scope/pkg`) and virtual modules (such as `virtual:foo`) are still left unresolved so that consumers can apply their own resolution.
