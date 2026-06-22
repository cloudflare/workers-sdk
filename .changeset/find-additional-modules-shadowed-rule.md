---
"wrangler": patch
---

Stop erroring when `find_additional_modules` discovers a file that only matches a inactive module rule

Module rules assign module _types_ to imported files — they are not include/exclude filters. Also, setting `fallthrough: false` in a rule will cause subsequent rules to become inactive. Previously, when `find_additional_modules` walked the filesystem and discovered a file whose only matching rule is inactive, Wrangler would throw an error and fail the build.

This meant that adding a user rule like the one below would break the build for any `.txt`, `.html`, `.sql`, `.bin` or `.wasm` file that didn't match the user-supplied globs but lived somewhere under the module root:

```jsonc
// wrangler.json
{
	"rules": [
		{
			"type": "Text",
			"globs": ["html/includeme.html"],
			"fallthrough": false,
		},
	],
}
```

Discovered files that only match an inactive rule are now silently skipped (a `debug`-level log records each skip for troubleshooting), so users can use `fallthrough: false` to narrow the set of files attached to their Worker without having to delete or move untouched files on disk.

The direct-import path is unchanged: importing a file in code that only matches an inactive rule is still a hard error, because the imported file genuinely needs a defined module type.

Fixes [#14257](https://github.com/cloudflare/workers-sdk/issues/14257).
