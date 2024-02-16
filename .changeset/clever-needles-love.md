---
"wrangler": minor
---

feat: add new `--env-interface` to `wrangler types`

Add the possibility for users to specify the "env" interface name
they want `wrangler types` to generate, via the new CLI flag `env-interface`

Example:

```sh
wrangler types --env-interface CloudflareEnv
```

generates

```ts
interface CloudflareEnv {}
```

instead of

```ts
interface Env {}
```
