# `@cloudflare/codemod`

Codemods for upgrading Cloudflare developer projects.

Run a specific codemod:

```sh
npx @cloudflare/codemod vitest vitest-v3-to-v4
```

Run every relevant codemod in a category to bring a project up to date:

```sh
npx @cloudflare/codemod vitest
```

Use `--dry-run` to list changes without writing them, `--cwd <path>` to target
another project, or repeat `--files <glob>` to restrict the files considered.

## Developing Codemods

Writing codemods often requires trial and error. The package ships a dedicated dev workflow so you can iterate on transforms in isolation without writing throw-away scripts.

### Commands

| Command         | Description                                                |
| --------------- | ---------------------------------------------------------- |
| `pnpm dev`      | Run `src/dev.ts` in watch mode (hot-reloads on every save) |
| `pnpm dev:once` | Run `src/dev.ts` once without watching                     |

### Workflow

1. Edit `dev-snippets/test.ts` with the source code to transform.
2. Edit `testCodemod()` in `src/dev.ts` with a [`recast`](https://github.com/benjamn/recast) visitor.
3. Run `pnpm dev`; output is printed and written under `dev-snippets-outputs/`.

`testTransform(filePath, methods)` mirrors the production `transformFile()` API, but writes transformed output to the development output directory. The input must be inside `dev-snippets/`.
