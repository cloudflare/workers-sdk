---
"wrangler": minor
---

feat: add new `path` positional argument to `wrangler types`

Add the possibility for users to specify the d.ts file they want
`wrangler types` to generate

Example:

```sh
wrangler types ./my-env.d.ts
```

generates a `my-env.d.ts` file in the current directory
instead of creating a `worker-configuration.d.ts` file
