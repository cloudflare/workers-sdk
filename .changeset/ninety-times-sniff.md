---
"wrangler": patch
---

Fixed self-bindings (service bindings to the same worker) showing as [not connected] in wrangler dev. Self-bindings now correctly show as [connected] since a worker is always available to itself.
