---
"wrangler": minor
---

feature: support named entrypoints in service bindings

This change allows service bindings to bind to a named export of another Worker. As an example, consider the following Worker named `bound`:

```ts
import { WorkerEntrypoint } from "cloudflare:workers";

export class EntrypointA extends WorkerEntrypoint {
	fetch(request) {
		return new Response("Hello from entrypoint A!");
	}
}

export const entrypointB: ExportedHandler = {
	fetch(request, env, ctx) {
		return new Response("Hello from entrypoint B!");
	}
};

export default <ExportedHandler>{
	fetch(request, env, ctx) {
		return new Response("Hello from the default entrypoint!");
	}
};
```

Up until now, you could only bind to the `default` entrypoint. With this change, you can bind to `EntrypointA` or `entrypointB` too using the new `entrypoint` option:

```toml
[[services]]
binding = "SERVICE"
service = "bound"
entrypoint = "EntrypointA"
```

To bind to named entrypoints with `wrangler pages dev`, use the `#` character:

```shell
$ wrangler pages dev --service=SERVICE=bound#EntrypointA
```
