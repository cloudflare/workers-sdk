---
"create-cloudflare": patch
---

Pass `--no-install` to `@tanstack/cli create` during scaffolding

Previously, the TanStack Start template did not pass `--no-install` to the framework CLI, causing dependencies to be installed twice: once by `@tanstack/cli create` and again by C3's own install step. This aligns the TanStack Start template with other framework templates that already skip the framework CLI's install.
