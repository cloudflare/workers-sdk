---
"wrangler": patch
---

Force-open a chromium-based browser for devtools

We rely on Chromium-based devtools for debugging workers, so when opening up the devtools URL,
we should force a chromium-based browser to launch. For now, this means checking (in order)
for Chrome and Edge, and then failing if neither of those are available.
