---
"miniflare": patch
---

Move internal proxy endpoint to reserved `/cdn-cgi/` path

The internal HTTP endpoint used by `getPlatformProxy` has been moved to a reserved path. This is an internal change with no impact on the `getPlatformProxy` API.
