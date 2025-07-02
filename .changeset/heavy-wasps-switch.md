---
"wrangler": patch
---

Preview Aliases: Force alias generation to meet stricter naming requirements.

For cases where CI is requesting Wrangler to generate the alias based on the branch name, we want a stricter check around the generated alias name in order to avoid version upload failures. If a valid alias name was not able to be generated, we warn and do not provide an alias (avoiding a version upload failure).
