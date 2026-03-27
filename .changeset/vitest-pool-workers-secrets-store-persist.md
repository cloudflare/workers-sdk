---
"@cloudflare/vitest-pool-workers": patch
---

Add `adminSecretsStore()` to `cloudflare:test` for seeding secrets in tests

Secrets store bindings only expose a read-only `.get()` method, so there was previously no way to seed secret values from within a test. The new `adminSecretsStore()` helper returns Miniflare's admin API for a secrets store binding, giving tests full control over create, update, and delete operations.

```ts
import { adminSecretsStore } from "cloudflare:test";
import { env } from "cloudflare:workers";

const admin = adminSecretsStore(env.MY_SECRET);
await admin.create("test-value");

const value = await env.MY_SECRET.get(); // "test-value"
```
