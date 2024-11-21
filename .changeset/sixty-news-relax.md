---
"wrangler": patch
---

Rename `directory` to `projectRoot` and ensure it's relative to the `wrangler.toml`. This fixes a regression which meant that `.wrangler` temporary folders were inadvertently generated relative to `process.cwd()` rather than the location of the `wrangler.toml` file. It also renames `directory` to `projectRoot`, which affects the `unstable_startWorker() interface.
