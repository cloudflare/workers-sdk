---
"wrangler": minor
---

feat: support partial bundling with configurable external modules

Setting `find_additional_modules` to `true` in your configuration file will now instruct Wrangler to look for files in
your `base_dir` that match your configured `rules`, and deploy them as unbundled, external modules with your Worker.
`base_dir` defaults to the directory containing your `main` entrypoint.

Wrangler can operate in two modes: the default bundling mode and `--no-bundle` mode. In bundling mode, dynamic imports
(e.g. `await import("./large-dep.mjs")`) would be bundled into your entrypoint, making lazy loading less effective.
Additionally, variable dynamic imports (e.g. `` await import(`./lang/${language}.mjs`) ``) would always fail at runtime,
as Wrangler would have no way of knowing which modules to upload. The `--no-bundle` mode sought to address these issues
by disabling Wrangler's bundling entirely, and just deploying code as is. Unfortunately, this also disabled Wrangler's
code transformations (e.g. TypeScript compilation, `--assets`, `--test-scheduled`, etc).

With this change, we now additionally support _partial bundling_. Files are bundled into a single Worker entry-point file
unless `find_additional_modules` is `true`, and the file matches one of the configured `rules`. See
https://developers.cloudflare.com/workers/wrangler/bundling/ for more details and examples.
