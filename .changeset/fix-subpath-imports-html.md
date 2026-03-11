---
"@cloudflare/vite-plugin": patch
---

Fix a bug that prevented using subpath imports for additional module types

You can now use subpath imports for additional module types (`.html`, `.txt`, `.sql`, `.bin`, `.wasm`) by defining them in your `package.json` `imports` field:

```jsonc
// package.json
{
	"imports": {
		"#templates/page": "./src/templates/page.html",
	},
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
