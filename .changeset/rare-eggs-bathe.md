---
"wrangler": patch
---

chore: replace `node-fetch` with `undici`

There are several reasons to replace `node-fetch` with `undici`:

- `undici`'s `fetch()` implementation is set to become node's standard `fetch()` implementation, which means we can just remove the dependency in the future (or optionally load it depending on which version of node is being used)
- `node-fetch` pollutes the global type space with a number of standard types
- we already bundle `undici` via `miniflare`/pages, so this means our bundle size could ostensibly become smaller.

This replaces `node-fetch` with `undici`.

- All instances of `import fetch from "node-fetch"` are replaced with `import {fetch} from "undici"`
- `undici` also comes with spec compliant forms of `FormData` and `File`, so we could also remove `formdata-node` in `form_data.ts`
- All the global types that were injected by `node-fetch` are now imported from `undici` (as well as some mistaken ones from `node:url`)
- NOTE: this also turns on `skipLibCheck` in `tsconfig.json`. Some dependencies oddly depend on browser globals like `Request`, `Response` (like `@miniflare/core`, `jest-fetch-mock`, etc), which now fail because `node-fetch` isn't injecting those globals anymore. So we enable `skipLibCheck` to bypass them. (I'd thought `skipLibCheck` completely ignores 'third party' types, but that's not true - it still uses the module graph to scan types. So we're still typesafe. We should enable `strict` sometime to avoid `any`s, but that's for later.)
- The bundle size isn't smaller because we're bundling 2 different versions of `undici`, but we'll fix that by separately upping the version of `undici` that miniflare bundles.
