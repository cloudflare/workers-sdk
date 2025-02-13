---
"@cloudflare/vite-plugin": patch
---

fix Node.js compat module resolution

In v0.0.8 we landed support for Vite 6.1 and also switched to using the new Cloudflare owned unenv preset.
Unfortunately, the changes made in that update caused a regression in Node.js support.
This became apparent only when the plugin was being used with certain package managers and outside of the workers-sdk monorepo.

The unenv polyfills that get compiled into the Worker are transitive dependencies of this plugin, not direct dependencies of the user's application were the plugin is being used.
This is on purpose to avoid the user having to install these dependencies themselves.

Unfortunately, the changes in 0.0.8 did not correctly resolve the polyfills from `@cloudflare/unenv-preset` and `unenv` when the dependencies were not also installed directly into the user's application.

The approach was incorrectly relying upon setting the `importer` in calls to Vite's `resolve(id, importer)` method to base the resolution in the context of the vite plugin package rather than the user's application.
This doesn't work because the `importer` is only relevant when the `id` is relative, and not a bare module specifier in the case of the unenv polyfills.

This change fixes how these id are resolved in the plugin by manually resolving the path at the appropriate point, while still leveraging Vite's resolution pipeline to handle aliasing, and dependency optimization.

This change now introduces e2e tests that checks that isolated installations of the plugin works with npm, pnpm and yarn.
