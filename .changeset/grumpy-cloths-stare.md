---
"create-cloudflare": patch
"@cloudflare/workers-utils": patch
"miniflare": patch
"wrangler": patch
---

XDG paths now use `wrangler` rather than the hidden `.wrangler` sub-path

The XDG container directory is already hidden so there is no value in hiding the sub-path.
In fact it can cause confusion if it is not easy to find the sub-path quickly.

If Wrangler finds `.wrangler` XDG paths or legacy home-based config paths, it will migrate them to this new location.
