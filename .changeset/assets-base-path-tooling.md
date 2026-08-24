---
"@cloudflare/config": minor
"@cloudflare/deploy-helpers": minor
"@cloudflare/vite-plugin": minor
"@cloudflare/workers-utils": minor
"miniflare": minor
"wrangler": minor
---

Add `assets.base_path` support to Workers Assets

Serve an asset directory from a public URL prefix without changing its on-disk layout:

```jsonc
{
  "assets": {
    "directory": "./public",
    "base_path": "/docs"
  }
}
```

Wrangler, preview, Miniflare, and generated build configuration preserve the selected value, while the Asset Worker normalizes it and strips the prefix only for asset lookup. Requests passed to a user Worker, request-facing headers, and redirects retain the public path. Relative pathname inputs are interpreted as root-relative prefixes, URL-shaped values are rejected, and omitting the option preserves existing root-path behavior. The Vite plugin inherits a compatible root-relative Vite `base` when `assets.base_path` is omitted.

Authored `_headers` and `_redirects` rules continue to match full public paths. In particular, both the source and destination of an authored `200` asset rewrite must include the configured public prefix; Asset Worker-generated redirects are prefixed automatically.
