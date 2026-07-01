---
"@cloudflare/workers-auth": minor
---

Configure auth storage by location (path + format) instead of an injected storage object.

`createOAuthFlow` now takes a `storageFactory: (profile?: string) => ConfigFileLocation` that maps the active auth profile to a file location (`{ getPath, format }`, where `format` is `"toml"` or `"json"`), and `readStoredAuthState` / the location-based `readAuthConfig` / `writeAuthConfig` helpers take a `ConfigFileLocation` directly, rather than an injected storage object. workers-auth owns the on-disk I/O (parsing, serialization, owner-only permissions); the storage abstraction is internal. Because the location is plain values, a consumer can configure it entirely from environment variables.

`getClientIdFromEnv` and the OAuth endpoint/staging environment variables now prefer the CLI-neutral `CLOUDFLARE_`-prefixed names over their `WRANGLER_`-prefixed equivalents (retained as deprecated aliases). The `createFileStorage` function and the `AuthConfigStorage` / `ConfigStorage` types are no longer part of the public surface.
