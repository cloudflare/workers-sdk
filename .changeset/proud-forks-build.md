---
"wrangler": patch
---

fix: widen multi-env `vars` types in `wrangler types`

Currently, the type generated for `vars` is a string literal consisting of the value of the variable in the top level environment. If multiple environments
are specified this wrongly restricts the type, since the variable could contain any of the values from each of the environments.

For example, given a `wrangler.toml` containing the following:

```
[vars]
MY_VAR = "dev value"

[env.production.vars]
MY_VAR = "prod value"
```

running `wrangler types` would generate:

```ts
interface Env {
	MY_VAR: "dev value";
}
```

making typescript incorrectly assume that `MY_VAR` is always going to be `"dev value"`

after these changes, the generated interface would instead be:

```ts
interface Env {
	MY_VAR: "dev value" | "prod value";
}
```
