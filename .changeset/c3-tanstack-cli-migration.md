---
"create-cloudflare": minor
---

Migrate TanStack Start scaffolding from `@tanstack/create-start` to `@tanstack/cli`

TanStack has consolidated their project scaffolding into a unified CLI package (`@tanstack/cli`) with a `create` subcommand, replacing the previous `@tanstack/create-start` package. This updates C3 to use the new CLI while preserving the same Cloudflare deployment target and React framework options.
