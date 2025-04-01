---
"@cloudflare/vite-plugin": patch
---

replace modules runtime checks with vite environment config validation

currently at runtime the vite plugin applies checks to make sure that
external files are not being imported, such checks are however too
restrictive and prevent worker code to perform some valid imports from
node_modules (e.g. `import stylesheet from "<some-package>/styles.css?url";`)

the changes here replace the runtime checks (allowing valid imports from
node_modules) with some validation to the worker vite environment configurations,
specifically they make sure that the environment doesn't specify invalid
`optimizeDeps.exclude` and `resolve.external` options
