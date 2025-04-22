---
"miniflare": minor
"wrangler": minor
---

Add support for defining `props` on a Service binding.

In your configuration file, you can define a service binding with props:

```json
{
	"services": [
		{
			"binding": "MY_SERVICE",
			"service": "some-worker",
			"props": { "foo": 123, "bar": "value" }
		}
	]
}
```

These can then be accessed by the callee:

```ts
import { WorkerEntrypoint } from "cloudflare:workers";

export default class extends WorkerEntrypoint {
	fetch() {
		return new Response(JSON.stringify(this.ctx.props));
	}
}
```
