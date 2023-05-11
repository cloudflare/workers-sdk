---
"wrangler": major
---

feature: remove delegation to locally installed versions

Previously, if Wrangler was installed globally _and_ locally within a project,
running the global Wrangler would instead invoke the local version.
This behaviour was contrary to most other JavaScript CLI tools and has now been
removed. We recommend you use `npx wrangler` instead, which will invoke the
local version if installed, or install globally if not.
