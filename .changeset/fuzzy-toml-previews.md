---
"wrangler": patch
---

Fix beta Preview onboarding rejecting TOML files with quoted hash characters

Previously, Wrangler treated `#` characters inside quoted TOML values as comments and unnecessarily fell back to manual onboarding instructions. Wrangler now distinguishes those characters from actual comments and can add the suggested Preview configuration automatically.
