---
"wrangler": patch
---

Improve framework detection when multiple frameworks are found

When autoconfig detects multiple frameworks in a project, Wrangler now applies smarter logic to select the most appropriate one. Selecting the wrong one is acceptable locally where the user can change the detected framework, in CI an error is instead thrown.
