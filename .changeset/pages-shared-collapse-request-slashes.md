---
"@cloudflare/pages-shared": minor
---

Collapse repeated slashes in request paths and remove the `asset-server/patchUrl` module

The original Workers URL parser (`url_original`, the default before compatibility date 2022-10-31) collapsed repeated slashes, so Pages has always matched `_redirects`, `_headers` and assets against paths such as `//secure/page` as if they were `/secure/page`. The WHATWG URL parser (`url_standard`) keeps them, so the asset server now collapses them itself before matching. This keeps `_headers` rules applying to those paths, and makes the `wrangler pages dev` behavior match production.

This is a breaking change for asset servers that import `@cloudflare/pages-shared/dist/asset-server/patchUrl`. Importing it replaced the global `URL`, which made the original parser accept malformed percent-escapes such as `/100%` or `?sub=%RAND%`. Without it, requests like those return 500 on the original parser. Remove the import and enable the `url_standard` compatibility flag (or a compatibility date of 2022-10-31 or later) in the same change. `url_standard` accepts those requests, and also stops them failing with `Invalid base URL string.` when they match a redirect rule.
