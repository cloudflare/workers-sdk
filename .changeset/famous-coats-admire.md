---
"create-cloudflare": patch
---

Update the Next.js template

* Removed top-level `await` in `next.config.ts` as it is not allowed there and not required.
* Improved setupDevPlatform() comment
