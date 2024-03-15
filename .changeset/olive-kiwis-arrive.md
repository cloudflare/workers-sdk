---
"wrangler": patch
---

fix: widen multi-env `vars` types in `wrangler types`

Currently types for variable generate string literal, those are appropriate when
a single environment has been specified in the config file but if multiple environments
are specified this however wrongly restricts the typing, the changes here fix such
incorrect behavior.

For example, given a `wrangler.toml` containing the following:

```
[vars]
MY_VAR = "dev value"

[env.production]
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
