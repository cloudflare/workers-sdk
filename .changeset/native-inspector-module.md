---
"@cloudflare/unenv-preset": minor
---

Add support for native `node:inspector` module when the `enable_nodejs_inspector_module` compatibility flag is enabled. This feature is currently experimental and requires both the `enable_nodejs_inspector_module` and `experimental` compatibility flags to be set.

To enable the native inspector module, add the following to your `wrangler.jsonc`:

```jsonc
{
	"compatibility_flags": ["experimental", "enable_nodejs_inspector_module"],
}
```

Then you can import and use the inspector module in your Worker:

```javascript
import inspector from "node:inspector";

// Access inspector APIs (note: workerd's implementation is a non-functional stub)
inspector.url(); // returns undefined
inspector.close(); // no-op
```
