---
"miniflare": patch
---

Match production Cloudflare Access context behavior for Workers with assets

Consume simulated Access metadata at the assets Router Worker so the user Worker does not receive `ctx.access` through the router's service binding. Requests matching configured routes now use the same assets pipeline as fallback requests. This relies on workerd stripping the local Access blob header when extracting it before invoking a fetch handler.
