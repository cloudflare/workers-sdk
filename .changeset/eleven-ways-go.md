---
"miniflare": patch
---

Local explorer: validate host and origin headers before Miniflare modifies them

If `routes` are set, Miniflare will alter the host and origin headers to match, causing the local explorer to mistakenly identify and block same-origin requests.

Note the local explorer is a WIP experimental feature.
