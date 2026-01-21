---
"@cloudflare/unenv-preset": minor
---

Add support for native `node:readline` module when the `enable_nodejs_readline_module` compatibility flag is enabled. This feature is currently experimental and requires both the `enable_nodejs_readline_module` and `experimental` compatibility flags to be set.

To enable the native readline module, add the following to your `wrangler.jsonc`:

```jsonc
{
	"compatibility_flags": ["experimental", "enable_nodejs_readline_module"],
}
```

Then you can import and use the readline module in your Worker:

```javascript
import readline from "node:readline";

// Access readline APIs
readline.clearLine(stream, dir);
readline.cursorTo(stream, x, y);
const rl = readline.createInterface({ input, output });
```
