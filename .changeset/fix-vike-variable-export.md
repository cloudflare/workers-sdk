---
"wrangler": patch
---

fix: handle Vike config files that use a variable-referenced default export

Newer versions of `create-vike` (0.0.616+) generate `pages/+config.ts` files using
`const config: Config = { ... }; export default config;` instead of the previous
`export default { ... } satisfies Config;`. The Wrangler autoconfig AST transformation
now resolves `Identifier` exports to their variable declarations, supporting both
old and new Vike config file formats.
