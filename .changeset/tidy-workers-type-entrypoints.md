---
"wrangler": minor
"create-cloudflare": patch
---

Add an explicit opt-out for main module imports in generated Worker types

Use `wrangler types --include-main-module=false` when the Worker entrypoint is generated build output that should not be type-checked as application source. The corresponding `includeMainModule` option is available in the experimental type-generation API. The option is preserved by `--check` and automatic regeneration. Omitting the import opts out of module-derived `ctx.exports` typing while preserving runtime types, environment bindings, and Durable Object namespace declarations.

New SvelteKit Workers projects created with C3 use this option so their generated declarations remain stable before and after a build. Imports needed to type Durable Object, service, and Workflow bindings are unaffected.
