---
"@cloudflare/workers-shared": minor
---

Add base-path routing to the Asset Worker

The Asset Worker can now serve an asset directory beneath a configured public URL prefix without changing its on-disk layout. It normalizes the prefix, applies it only to asset lookup, and preserves the original public path for user Workers, headers, redirects, and routing rules.
