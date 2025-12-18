---
"@cloudflare/unenv-preset": minor
---

Add support for native `node:dgram` module when the `enable_nodejs_dgram_module` compatibility flag is enabled. This feature is currently experimental and requires both the `enable_nodejs_dgram_module` and `experimental` compatibility flags to be set.

To enable the native dgram module, add the following to your `wrangler.jsonc`:

```jsonc
{
  "compatibility_flags": ["experimental", "enable_nodejs_dgram_module"]
}
```

Then you can import and use the dgram module in your Worker:

```javascript
import dgram from "node:dgram";

// Access dgram APIs (note: workerd's implementation is currently a non-functional stub)
const socket = dgram.createSocket("udp4");
```
