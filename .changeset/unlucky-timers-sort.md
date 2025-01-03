---
"wrangler": minor
---

add `strict-vars` option to `wrangler types`

add a new `--strict-vars` option to `wrangler types` that developers can use to enable/disable
more strict/literal types for their variables

opting out of strict variables can be useful when developers change often their `vars` values,
even more so when multiple environments are involved

## Example

With a toml containing:

```toml
[vars]
MY_VARIABLE = "production_value"
MY_NUMBERS = [1, 2, 3]

[env.staging.vars]
MY_VARIABLE = "staging_value"
MY_NUMBERS = [7, 8, 9]
```

the `wrangler types` command would generate the following interface:

```
interface Env {
        MY_VARIABLE: "production_value" | "staging_value";
        MY_NUMBERS: [1,2,3] | [7,8,9];
}
```

while `wrangler types --strict-vars=false` would instead generate:

```
interface Env {
        MY_VARIABLE: string;
        MY_NUMBERS: number[];
}
```

(allowing the developer to easily change their toml variables without the
risk of braking typescript types)
