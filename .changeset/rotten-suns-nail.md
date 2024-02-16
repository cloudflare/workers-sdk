---
"miniflare": minor
---

feat: add support for custom root paths

Miniflare has lots of file-path-valued options (e.g. `scriptPath`, `kvPersist`, `textBlobBindings`). Previously, these were always resolved relative to the current working directory before being used. This change adds a new `rootPath` shared, and per-worker option for customising this behaviour. Instead of resolving relative to the current working directory, Miniflare will now resolve path-valued options relative to the closest `rootPath` option. Paths are still resolved relative to the current working directory if no `rootPath`s are defined. Worker-level `rootPath`s are themselves resolved relative to the shared `rootPath` if defined.

<!--prettier-ignore-start-->

```js
import { Miniflare } from "miniflare";

const mf1 = new Miniflare({
  scriptPath: "index.mjs", // Resolves to "$PWD/index.mjs"
});

const mf2 = new Miniflare({
  rootPath: "a/b",
  scriptPath: "c/index.mjs", // Resolves to "$PWD/a/b/c/index.mjs"
});

const mf3 = new Miniflare({
  rootPath: "/a/b",
  workers: [
    {
      name: "1",
      rootPath: "c",
      scriptPath: "index.mjs", // Resolves to "/a/b/c/index.mjs"
    },
    {
      name: "2",
      scriptPath: "index.mjs", // Resolves to "/a/b/index.mjs"
    }
  ],
});
```

<!--prettier-ignore-end-->
