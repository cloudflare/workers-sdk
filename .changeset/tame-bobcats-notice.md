---
"wrangler": minor
---

Add `--check` flag to `wrangler types` command

The new `--check` flag allows you to verify that your generated types file is up-to-date without regenerating it. This is useful for CI/CD pipelines, pre-commit hooks, or any scenario where you want to ensure types have been committed after configuration changes.

When types are up-to-date, the command exits with code 0:

```bash
$ wrangler types --check
✨ Types at worker-configuration.d.ts are up to date.
```

When types are out-of-date, the command exits with code 1:

```bash
$ wrangler types --check
✘ [ERROR] Types at worker-configuration.d.ts are out of date. Run `wrangler types` to regenerate.
```

You can also use it with a custom output path:

```bash
wrangler types ./custom-types.d.ts --check
```
