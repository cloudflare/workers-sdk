# `@cloudflare/codemods`

Codemods for upgrading Cloudflare developer projects.

Run a codemod by name:

```sh
npx @cloudflare/codemods vitest:v3-to-v4
```

Available codemods:

- `vitest:v3-to-v4` — migrate `@cloudflare/vitest-pool-workers` configuration from
  Vitest v3 to v4
- `vitest:pool-workers-to-vitest-plugin` — rename `@cloudflare/vitest-pool-workers`
  to `@cloudflare/vitest-plugin` v1

Use `--dry-run` to list changes without writing them, `--cwd <path>` to target
another project, or repeat `--files <glob>` to restrict the files considered.
