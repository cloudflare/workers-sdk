---
"@cloudflare/workers-shared": patch
---

Warn when `_headers` rules contain multiple wildcards or wildcard combined with `:splat`

Rules containing multiple wildcards (e.g. `https://*.workers.dev/*`) or combining a wildcard with a `:splat` placeholder (e.g. `https://*.pages.dev/:splat`) are now rejected during parsing. Previously this would fail silently during dev.
