---
"wrangler": patch
"miniflare": patch
"@cloudflare/vitest-pool-workers": patch
"create-cloudflare": patch
"@cloudflare/workers-utils": patch
---

Bump `undici` from 7.28.0 to 7.29.0 to resolve 5 CVE advisories

Updated `undici` to address the following vulnerabilities:

- CVE-2026-13697 (High): Cross-user information disclosure via cache directive parsing
- CVE-2026-16728 (Moderate): Response desynchronization via retry interceptor
- CVE-2026-15157 (Moderate): CRLF injection via blob-like body type property
- CVE-2026-14643 (Moderate): Cross-user cache disclosure via whitespace handling
- CVE-2026-16729 (Moderate): Cookie attribute injection via unsanitized fields

These CVEs were published July 29, 2026 and all patched in `undici@7.29.0`.
