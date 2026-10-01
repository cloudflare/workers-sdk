---
"@cloudflare/vitest-plugin": major
---

Require [Vitest 5](https://vitest.dev/blog/vitest-5.html) and use Workerd's new module registry

Drop support for Vitest 4 and require Vitest 5. Vitest workers now always use the new module registry, including when `legacy_module_registry` is configured, removing the legacy V1 module fallback path.
