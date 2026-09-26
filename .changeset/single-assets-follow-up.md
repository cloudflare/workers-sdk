---
"@cloudflare/codemods": patch
---

Report an unmigrated Vite assets directory once

Vite migrations previously reported `assets.directory` both as Wrangler tooling and as a separate assets follow-up. The codemod now reports only the assets-specific follow-up, which includes a documentation link.
