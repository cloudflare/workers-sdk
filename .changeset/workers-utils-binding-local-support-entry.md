---
"@cloudflare/workers-utils": minor
---

Add a `@cloudflare/workers-utils/binding-local-support` entry point

It exports `getBindingLocalSupport()`, `resolveBindingRemote()` and `validateBindingRemoteSetting()` without the package's config validation barrel, so bundled consumers such as Miniflare can check binding `remote` settings through a narrow import. `getBindingTypeFriendlyName()` moves to its own module and is still exported from the package root.
