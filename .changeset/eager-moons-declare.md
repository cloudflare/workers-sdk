---
"create-cloudflare": patch
---

Stop `--lang` from hiding templates that have no language variants

`--lang` filtered out every template that does not declare `copyFiles` variants, because such a template has a single set of files and so no variant key to match the language against. That hid templates whose files are written in the requested language. `create-cloudflare --lang ts` dropped `API starter (OpenAPI compliant)` from the Application Starter list, and failed with `Unknown application type provided: openapi` when that template was named with `--type`. It also dropped 15 of the 18 framework starters, so `create-cloudflare --framework=hono --lang=ts` failed with `Unsupported framework: hono`.

A template that ships a single set of files now declares the `--lang` values it can be created with. For a framework whose own CLI writes the project, that is what the CLI can produce, since `--lang` is not passed to it: a framework that only scaffolds TypeScript, such as Qwik, Angular or Nuxt, is offered for `--lang ts` but not for `--lang js`. Python filtering is unchanged: it is only ever offered through an explicit `copyFiles` variant, so a template without one is still left out of `--lang python`.
