---
"wrangler": patch
---

Validate header rules reject multiple wildcards in parseHeaders()

Header rules with multiple wildcards (e.g., `https://*.pages.dev/*`) or combining a wildcard with a `:splat` placeholder were previously accepted during parsing but silently failed at runtime due to JavaScript regex duplicate named capture group errors. This change adds validation in `parseHeaders()` to reject such rules early with clear error messages, helping users identify and fix invalid configurations during development rather than experiencing silent failures in production.
