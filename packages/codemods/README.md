# `@cloudflare/codemods`

Codemods for upgrading Cloudflare developer projects.

Run a specific codemod:

```sh
npx @cloudflare/codemods vitest vitest-v3-to-v4
```

Run every relevant codemod in a category to bring a project up to date:

```sh
npx @cloudflare/codemods vitest
```

Use `--dry-run` to list changes without writing them, `--cwd <path>` to target
another project, or repeat `--files <glob>` to restrict the files considered.
