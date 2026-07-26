---
"miniflare": patch
---

Hide the workerd console window on Windows when the parent process has no console. Spawning workerd without `windowsHide: true` caused Windows Terminal to open a visible, focus-stealing window for background or detached parents (for example Astro's `astro dev --background`).
