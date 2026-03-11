---
"@cloudflare/vite-plugin": minor
---

Support subpath imports for additional module types

The additional modules plugin now intercepts `#`-prefixed specifiers, delegates to Vite's built-in resolver to resolve the subpath import first, then checks the resolved path against the module rules.

You can now use subpath imports for additional module types (`.html`, `.txt`, `.sql`, `.bin`, `.wasm`) by defining them in your `package.json` `imports` field:

```jsonc
// package.json
{
	"imports": {
		"#templates/page": "./src/templates/page.html"
	}
}
```

```ts
import page from "#templates/page";

export default {
	fetch() {
		return new Response(page, {
			headers: { "Content-Type": "text/html" },
		});
	},
} satisfies ExportedHandler;
```
