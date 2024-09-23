---
"wrangler": major
---

refactor: use `esbuild-plugins-node-modules-polyfill`

Replaces `@esbuild-plugins/node-globals-polyfill` & `@esbuild-plugins/node-modules-polyfill` with the up-to-date & maintained `esbuild-plugins-node-modules-polyfill`

The `esbuild-plugins` repository actually points towards using `esbuild-plugin-polyfill-node` instead
https://github.com/remorses/esbuild-plugins/blob/373b44902ad3e669f7359c857de09a930ce1ce90/README.md?plain=1#L15-L16

But the Remix repo (see https://github.com/remix-run/remix/pull/5274) tried this and found some regressions.
So they chose to go for @imranbarbhuiya's `esbuild-plugins-node-modules-polyfill` instead (see https://github.com/remix-run/remix/pull/6562), which is an up-to-date and well maintained alternative.

Users should no longer see the following deprecation warnings when installing Wrangler:

```sh
npm WARN deprecated rollup-plugin-inject@3.0.2: This package has been deprecated and is no longer maintained. Please use @rollup/plugin-inject.
npm WARN deprecated sourcemap-codec@1.4.8: Please use @jridgewell/sourcemap-codec instead
```

Resolves https://github.com/cloudflare/workers-sdk/issues/1232

**Possible Breaking Change:**
Since we are swapping out the entire polyfill library for a new one, there is a chance that projects using `node_compat` will experience regressions when trying to deploy.

If you have such a Worker, ensure that you test it carefully before deploying when migrating from Wrangler v3 to Wrangler v4.
