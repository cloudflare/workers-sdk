---
"create-cloudflare": patch
---

Prevent the common template's proxy and redirect examples from accepting arbitrary destinations

The examples now use fixed destinations that developers can change in the generated source instead of destinations supplied by unauthenticated requests.
