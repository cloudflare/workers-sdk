---
"wrangler": patch
---

feat: Durable Object multi-worker bindings in local dev.

Building on [the recent work for multi-worker Service bindings in local dev](https://github.com/cloudflare/wrangler2/pull/1503), this now adds support for direct Durable Object namespace bindings.

A parent (calling) Worker will look for child Workers (where the Durable Object has been defined) by matching the `script_name` configuration option with the child's Service name. For example, if you have a Worker A which defines a Durable Object, `MyDurableObject`, and Worker B which references A's Durable Object:

```toml
name = "A"

[durable_objects]
bindings = [
	{ name = "MY_DO", class_name = "MyDurableObject" }
]
```

```toml
name = "B"

[durable_objects]
bindings = [
	{ name = "REFERENCED_DO", class_name = "MyDurableObject", script_name = "A" }
]
```

`MY_DO` will work as normal in Worker A. `REFERENCED_DO` in Worker B will point at A's Durable Object.

Note: this only works in local mode (`wrangler dev --local`) at present.
