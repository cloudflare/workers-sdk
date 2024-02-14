---
"miniflare": patch
---

fix: allow relative `scriptPath`/`modulesRoot`s to break out of current working directory

Previously, Miniflare would resolve relative `scriptPath`s against `moduleRoot` multiple times resulting in incorrect paths and module names. This would lead to `can't use ".." to break out of starting directory` `workerd` errors. This change ensures Miniflare uses `scriptPath` as is, and only resolves it relative to `modulesRoot` when computing module names. Note this bug didn't affect service workers. This allows you to reference a modules `scriptPath` outside the working directory with something like:

```js
const mf = new Miniflare({
	modules: true,
	modulesRoot: "..",
	scriptPath: "../worker.mjs",
});
```

Fixes #4721
