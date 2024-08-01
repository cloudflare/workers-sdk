---
"wrangler": patch
---

fix: remove bundle size warning from Worker deploy commands

Bundle size was a proxy for startup time. Now that we have startup time
reported, focus on bundle size is less relevant.
