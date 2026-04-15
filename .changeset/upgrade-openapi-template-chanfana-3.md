---
"create-cloudflare": minor
---

Upgrade OpenAPI template to chanfana 3 and Zod v4

The OpenAPI worker template has been upgraded to use chanfana v3.3 (from v2.6) and Zod v4 (from v3). All removed chanfana parameter helpers (`Str`, `Bool`, `Num`, `DateTime`) have been replaced with native Zod v4 equivalents. Other dependency updates include hono v4.12, wrangler v4, and @cloudflare/workers-types.

Additional template improvements:

- Fix response schemas to match actual handler return values
- Use `NotFoundException` for 404 responses instead of raw `Response.json()`
- Use HTTP 201 status for the create endpoint
- Enable full `strict` mode in tsconfig (previously silently overridden)
- Remove unused `@types/service-worker-mock` dependency
