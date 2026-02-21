---
"wrangler": patch
---

Reject cross-drive module paths in Pages Functions routing

On Windows, module paths using a different drive letter could be parsed in a
way that bypassed the project-root check. These paths are now parsed correctly
and rejected when they resolve outside the project.
