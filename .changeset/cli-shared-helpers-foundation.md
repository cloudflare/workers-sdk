---
"@cloudflare/cli-shared-helpers": minor
"@cloudflare/workers-utils": patch
"@cloudflare/autoconfig": patch
"@cloudflare/containers-shared": patch
"@cloudflare/deploy-helpers": patch
"create-cloudflare": minor
"@cloudflare/vitest-plugin": patch
"@cloudflare/vite-plugin": patch
---

Migrate shared CLI prompts and progress rendering to `@clack/prompts`, with common banner, message formatting and box helpers. Update Create Cloudflare and shared deployment and auto-config consumers to the new prompt API and visual style.

Preserve environment-based CI detection, cached update checks and release-pinned compatibility dates across consumers.
