---
"wrangler": minor
---

feat: Support runtime-agnostic polyfills

Previously, Wrangler treated any imports of `node:*` modules as build-time errors (unless one of the two Node.JS compatibility modes was enabled). This is sometimes overly aggressive, since those imports are often not hit at runtime (for instance, it was impossible to write a library that worked across Node.JS and Workers, using Node packages only when running in Node). Here's an example of a function that would cause Wrangler to fail to build:

```ts
export function randomBytes(length: number) {
	if (navigator.userAgent !== "Cloudflare-Workers") {
		return new Uint8Array(require("node:crypto").randomBytes(length));
	} else {
		return crypto.getRandomValues(new Uint8Array(length));
	}
}
```

This function _should_ work in both Workers and Node, since it gates Node-specific functionality behind a user agent check, and falls back to the built-in Workers crypto API. Instead, Wrangler detected the `node:crypto` import and failed with the following error:

```
✘ [ERROR] Could not resolve "node:crypto"

    src/randomBytes.ts:5:36:
      5 │ ... return new Uint8Array(require('node:crypto').randomBytes(length));
        ╵                                   ~~~~~~~~~~~~~

  The package "node:crypto" wasn't found on the file system but is built into node.
  Add "node_compat = true" to your wrangler.toml file to enable Node.js compatibility.
```

This change turns that Wrangler build failure into a warning, which users can choose to ignore if they know the import of `node:*` APIs is safe (because it will never trigger at runtime, for instance):

```
▲ [WARNING] The package "node:crypto" wasn't found on the file system but is built into node.

  Your Worker may throw errors at runtime unless you enable the "nodejs_compat"
  compatibility flag. Refer to
  https://developers.cloudflare.com/workers/runtime-apis/nodejs/ for more details.
  Imported from:
   - src/randomBytes.ts
```

However, in a lot of cases, it's possible to know at _build_ time whether the import is safe. This change also injects `navigator.userAgent` into `esbuild`'s bundle settings as a predefined constant, which means that `esbuild` can tree-shake away imports of `node:*` APIs that are guaranteed not to be hit at runtime, supressing the warning entirely.
