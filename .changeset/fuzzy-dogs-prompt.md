---
"@cloudflare/deploy-helpers": patch
"wrangler": patch
---

Avoid replacement prompts for custom domains already on the Worker

Wrangler now updates Preview settings without asking to replace a custom domain when that domain already belongs to the deployed Worker. It still asks before replacing domains attached to another Worker.
