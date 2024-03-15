---
"wrangler": major
---

feature: bump `esbuild` to [`0.18.20`](https://github.com/evanw/esbuild/blob/main/CHANGELOG.md#01820)

Previously, Wrangler used `esbuild@0.17.19` when bundling your Worker. Notable changes include:

- [Breaking changes](https://github.com/evanw/esbuild/blob/main/CHANGELOG.md#0180) to `tsconfig.json` support
- Support for [auto-accessors](https://github.com/tc39/proposal-grouped-and-auto-accessors?tab=readme-ov-file#auto-accessors)
- Support for [explicit resource management](https://github.com/tc39/proposal-explicit-resource-management) with `using` declarations

Note `esbuild` only transforms `using` syntax by default, relying on runtime support for `Symbol.dispose` and `Symbol.asyncDispose`. The Workers runtime doesn't provide these symbols yet, so Wrangler automatically injects polyfills for them. This allows you to use `using` without any additional changes.

Unfortunately, we currently aren't able to bump to [`0.19.0`](https://github.com/evanw/esbuild/blob/main/CHANGELOG.md#0190) and above. This version changes how dynamic `import()`s are handled in a way that's incompatible with Wrangler's own module collection behaviour. We're currently investigating potential workarounds.
