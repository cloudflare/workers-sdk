---
"miniflare": patch
---

Bump hono to ^4.12.5 and devalue to ^5.6.3 to address security vulnerabilities

Hono had multiple advisories including arbitrary file access via serveStatic, JWT algorithm confusion, and XSS through ErrorBoundary. Devalue had denial of service vulnerabilities in devalue.parse. These are bundled dependencies so the fix is delivered via this patch.
