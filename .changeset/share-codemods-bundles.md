---
"@cloudflare/codemods": patch
---

Share bundled dependencies between the CLI and library entry points

Build both entry points together to avoid shipping the same migration implementation and dependencies twice. The CLI command and public library exports remain unchanged.
