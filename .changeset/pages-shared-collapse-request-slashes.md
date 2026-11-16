---
"@cloudflare/pages-shared": minor
---

Collapse repeated slashes in request paths and remove the `asset-server/patchUrl` module

The original Workers URL parser collapsed repeated slashes, so Pages has always matched `_redirects`, `_headers` and assets against paths such as `//secure/page` as if they were `/secure/page`. The WHATWG URL parser keeps them, so the asset server now collapses them itself before matching. This keeps `_headers` rules applying to those paths, and makes the `wrangler pages dev` behavior match production.

`asset-server/patchUrl` worked around the original URL parser and is no longer needed. Asset servers that import it should enable the `url_standard` compatibility flag instead. That flag also stops requests with malformed percent-escapes, such as `?sub=%RAND%`, failing with `Invalid base URL string.` when they match a redirect rule.
