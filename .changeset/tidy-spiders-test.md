---
"@cloudflare/vitest-plugin": major
---

Add support for [Vitest 5](https://vitest.dev/blog/vitest-5.html) and use Workerd's new module registry

Expand the plugin's peer dependency to support Vitest 5 alongside Vitest 4.1.11. Vitest workers now always use the new module registry, including when `legacy_module_registry` is configured, removing the legacy V1 module fallback path.
