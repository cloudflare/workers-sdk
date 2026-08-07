---
"@cloudflare/deploy-helpers": patch
"wrangler": patch
---

Clean up Worker Preview and custom domain deploy success output.

`wrangler preview` now prints a compact success summary with Preview URL(s), Deployment ID, Deployment URL(s), and a Pull Request link when CI metadata is detected. It no longer prints box art, configuration source markers, observability/logpush settings, or preview bindings in the success output.

`wrangler deploy` custom domain targets are now grouped under a `Custom Domains:` section and no longer include internal `(custom domain)` or preview-state annotations.
