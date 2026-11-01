---
"@cloudflare/deploy-helpers": minor
---

Expose dedicated entry points for deployment workflows

Add `/deploy`, `/versions-upload`, `/triggers`, and `/preview` imports so tooling can load only the workflow needed by a command. These entry points share the initialized deploy-helpers context and preserve the existing root exports.
