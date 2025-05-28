---
"@cloudflare/workflows-shared": patch
---

Fix instance hydration after abort. Some use cases were causing instances to not be properly rehydrated after server shutdown, which would cause the instance to be lost.
