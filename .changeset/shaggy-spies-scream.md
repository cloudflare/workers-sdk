---
"wrangler": patch
---

fix: Warn when Pages Functions have no routes

Building/publishing pages functions with no valid handlers would result in a Functions script containing no routes, often because the user is using the functions directory for something unrelated. This will no longer add an empty Functions script to the deployment, needlessly consuming Functions quota.
