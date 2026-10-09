---
"create-cloudflare": patch
---

Handle pnpm build approvals when adding packages

Use the existing build-approval confirmation and retry flow when adding Wrangler or framework dependencies. This fixes scaffolding with pnpm 12 when a framework generator leaves dependency build scripts unapproved, and handles pnpm's wrapped package names in error messages.
