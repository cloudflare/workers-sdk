---
"wrangler": patch
---

Stop `wrangler email routing addresses create` from claiming a verification email was sent for addresses that are already verified

Cloudflare doesn't send a verification email when the destination address is already verified on the account, such as the account owner's own email. The command now shows the verification timestamp in that case. It only mentions a verification email when the address is still pending.
