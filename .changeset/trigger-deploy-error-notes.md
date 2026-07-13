---
"wrangler": patch
---

Surface underlying API error details in "Some triggers failed to deploy" message

Previously, when a trigger (workflow, schedule, custom domain) failed to deploy, Wrangler only showed the generic "A request to the Cloudflare API (...) failed." message and swallowed the actual reason. Now the specific API error notes are included directly in the error message.
