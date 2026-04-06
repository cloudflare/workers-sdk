---
"wrangler": patch
---

During autoconfig filter out Hono when there are 2 detected frameworks

During the auto-configuration process Hono is now treated as an auxiliary framework (like Vite) and automatically filtered out when two frameworks are detected (before Hono was being filtered out only when the other framework was Waku).
