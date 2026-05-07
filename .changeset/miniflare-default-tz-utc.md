---
"miniflare": minor
---

Default the `workerd` runtime subprocess to `TZ=UTC` to match the production Cloudflare runtime

Previously, Miniflare inherited the host machine's timezone, so `Date` and `Intl` APIs inside a Worker observed the developer's local timezone during local development but UTC in production. This caused dev/prod drift that was hard to debug.

Miniflare now sets `TZ=UTC` on the spawned `workerd` subprocess by default. A new `unsafeRuntimeEnv` option (a `Record<string, string>`) is available on the `Miniflare` constructor for advanced cases that need to override the default — for example, to test timezone-dependent behaviour:

```ts
new Miniflare({
	modules: true,
	script: "...",
	unsafeRuntimeEnv: { TZ: "Europe/London" },
});
```
