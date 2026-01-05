---
"@cloudflare/unenv-preset": minor
---

Add support for native `node:_stream_wrap` module when the `enable_nodejs_stream_wrap_module` compatibility flag is enabled. This feature is currently experimental and requires both the `enable_nodejs_stream_wrap_module` and `experimental` compatibility flags to be set.

To enable the native `_stream_wrap` module, add the following to your `wrangler.jsonc`:

```jsonc
{
	"compatibility_flags": ["experimental", "enable_nodejs_stream_wrap_module"],
}
```

Then you can import and use the `_stream_wrap` module in your Worker:

```javascript
import JSStreamSocket from "node:_stream_wrap";

// JSStreamSocket wraps a Duplex stream to provide a Socket-like interface
// This is primarily used internally by TLS and HTTP implementations
```
