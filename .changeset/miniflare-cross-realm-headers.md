---
"miniflare": patch
---

Fix `DevalueError: Cannot stringify arbitrary non-POJOs` when passing a `Headers` instance to a proxied binding method

`R2Object#writeHttpMetadata()`, `R2Bucket#put()`'s `onlyIf` option, and other proxied APIs that accept a `Headers` argument previously only worked if that `Headers` instance came from the exact same `Headers` implementation Miniflare uses internally (`undici`). In practice, user code almost always constructs `Headers` using the platform global instead (for example inside Next.js, Astro, Remix, or SvelteKit dev servers), which is backed by a different copy of `undici` and isn't `instanceof` the one Miniflare imports. This mismatch caused serialisation to fail with a confusing `DevalueError`, even though the exact same code worked fine when deployed.

`Headers`, `Request`, and `Response` values are now also recognised by their `Symbol.toStringTag`, which is realm-independent, so any spec-compliant instance is accepted regardless of which copy of the class created it.
