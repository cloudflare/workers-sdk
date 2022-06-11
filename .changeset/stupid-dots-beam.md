---
"wrangler": patch
---

feat: `build.watch_dir` can be an array of paths

In projects where:

- all the source code isn't in one folder (like a monorepo, or even where the worker has non-standard imports across folders),
- we use a custom build, so it's hard to statically determine folders to watch for changes

...we'd like to be able to specify multiple paths for custom builds, (the config `build.watch_dir` config). This patch enables such behaviour. It now accepts a single path as before, or optionally an array of strings/paths.

Fixes https://github.com/cloudflare/wrangler2/issues/1095
