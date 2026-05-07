---
"@cloudflare/vitest-pool-workers": patch
---

fix: resolve CJS alternatives when require() resolves to an ESM file via the "import" export condition in Vite 8

When Vite 8 switched to a rolldown-based resolver, `require()` calls in the module-fallback service started resolving to the `"import"` export condition of dual-format packages instead of `"require"`/`"default"`. This caused workerd to receive an ESM file where it expected CommonJS, producing `SyntaxError: Cannot use import statement outside a module`. Packages affected include `pg-protocol`, `pg-connection-string`, and any package with dual CJS/ESM exports that is transitively `require()`d by a worker under test.

In Vite 8 the main resolve plugin (`vite:resolve-builtin`) does not read the `kind` field from hook options per-request — its `isRequire` is a static value set at plugin-construction time. The `custom["node-resolve"].isRequire` convention used for Vite 7 is also silently ignored in Vite 8. Both hints are now passed to `pluginContainer.resolveId()` for forward and backward compatibility, but as a reliable fallback the module-fallback service also checks the package `exports` map: if the resolved path matches the `"import"` condition, the `"require"` or `"default"` CJS entry is returned instead.
