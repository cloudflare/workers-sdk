---
"wrangler": patch
---

fix redeploying container apps when previous deploy failed or container (but not image) was deleted.

Previously this failed with `No changes detected but no previous image found` as we assumed there would be a previous deployment when an image exists in the registry.
