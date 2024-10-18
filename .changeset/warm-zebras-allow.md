---
"wrangler": patch
---

fix: Reduce the maximum size of asset upload requests when creating a Pages deployment

We're continuing to investigate upstream changes that we can make to further improve reliability and allow for high-bandwidth uploads, but in the meantime, we've found that reducing the maximum size of asset upload requests can improve the reliability of deployment creation.
