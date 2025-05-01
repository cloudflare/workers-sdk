---
"wrangler": minor
---

This adds support for more accurate types for service bindings when running `wrangler types`. Previously, running `wrangler types` with a config including a service binding would generate an `Env` type like this:

```ts
interface Env {
  SERVICE_BINDING: Fetcher
}
```

This type was "correct", but didn't capture the possibility of using JSRPC to communicate with the service binding. Now, running `wrangler types -c wrangler.json -c ../service/wrangler.json` (the first config representing the current Worker, and any additional configs representing service bound Workers) will generate an `Env` type like this:

```ts
interface Env {
  SERVICE_BINDING: Service<import("../service/src/index").Entrypoint>;
}
```
