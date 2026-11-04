---
"miniflare": patch
---

Keep local Artifacts Git listener ports reserved throughout startup and reloads.

Bind both Git listeners to operating-system-assigned ports instead of probing for an available port and releasing it before workerd starts. A persistent local TCP proxy preserves clone URLs when the runtime reloads.
