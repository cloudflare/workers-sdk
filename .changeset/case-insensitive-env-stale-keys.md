---
"wrangler": patch
---

Fix `.env` loading on Windows leaking stale, differently-cased duplicate keys

On Windows, `wrangler` loads `.env` values through a case-insensitive `Proxy` wrapper so lookups like `env.PATH` and `env.Path` resolve to the same value, and this object is assigned directly to `process.env`. When a key was set again under a different casing (e.g. a value in `.env.local` overriding one from `.env` with different casing), the previous casing was never removed from the underlying object. `env.PATH`/`env.Path` still returned the correct, latest value, but anything that enumerates `process.env` — `Object.keys`, `for...in`, `JSON.stringify`, object spread, or a spawned subprocess inheriting the environment — would see both the stale and current key.

Duplicate entries no longer appear, so environment variables passed to subprocesses and any code that lists the environment now see only the latest value for each variable.
