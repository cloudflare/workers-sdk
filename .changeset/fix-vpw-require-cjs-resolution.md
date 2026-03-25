---
"@cloudflare/vitest-pool-workers": patch
---

fix: resolve CJS alternatives when require() resolves to an ESM file via the "import" export condition

Vite 8 switched to a rolldown-based module resolver that, when resolving a `require()` call, can select the `"import"` export condition from a dual-format package instead of the `"require"` or `"default"` condition. This caused workerd to receive an ESM file (`import` statements) where it expected a CommonJS module, producing `SyntaxError: Cannot use import statement outside a module`. Packages affected include `pg-protocol`, `pg-connection-string`, and any package with dual CJS/ESM exports that is transitively required by a worker under test.

The module-fallback service now checks whether a path resolved for a `require()` call appears in the package's exports map under the `"import"` condition. If so, it finds and returns the `"require"` or `"default"` CJS alternative instead.
