---
"wrangler": minor
---

feat: add new `--env-interface` to `wrangler types`

Allow users to specify the name of the interface that they want `wrangler types` to generate for the `env` parameter, via the new CLI flag `--env-interface`

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
