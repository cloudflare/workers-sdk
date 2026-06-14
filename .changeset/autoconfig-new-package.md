---
"@cloudflare/autoconfig": minor
---

New package for framework autoconfig detection and configuration

Extracted the Wrangler autoconfig logic into a standalone `@cloudflare/autoconfig` package that can detect project frameworks, configure them for Cloudflare Workers, and generate wrangler configuration files. The package provides a generic, context-based API where callers supply their own logger, dialogs, and lifecycle hooks.
