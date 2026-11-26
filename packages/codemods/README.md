# `@cloudflare/codemods`

Codemods for upgrading Cloudflare developer projects.

Run a codemod by name:

```sh
npx @cloudflare/codemods vitest:v3-to-v4
```

Available codemods:

- `wrangler-to-cf` - migrate a Wrangler configuration to the new `cf`
  configuration format
- `vitest:v3-to-v4` — migrate `@cloudflare/vitest-pool-workers` configuration from
  Vitest v3 to v4
- `vitest:pool-workers-to-vitest-plugin` — rename `@cloudflare/vitest-pool-workers`
  to `@cloudflare/vitest-plugin` v1

Use `--dry-run` to list changes without writing them, `--cwd <path>` to target
another project, or repeat `--files <glob>` to restrict the files considered.
When the target is inside a Git worktree, the worktree must be clean. Use
`--force` to bypass this safety check.

To migrate a Wrangler project:

```sh
npx @cloudflare/codemods wrangler-to-cf --cwd ./path/to/project
```

The CLI detects a single root `wrangler.jsonc`, `wrangler.toml`, or `wrangler.json`. Pass `--config <path>` to select another file, or pass `--bundler wrangler` to retain Wrangler-specific tooling configuration. For this codemod, `--files` filters the selected Wrangler config and skips the migration when it does not match.

## Programmatic usage

Codemods can also be run from JavaScript or TypeScript:

```ts
import { runCodemod } from "@cloudflare/codemods";

const { changedFiles } = await runCodemod("vitest:v3-to-v4", {
	cwd: process.cwd(),
	dryRun: false,
});
```

`runCodemod` accepts the same codemod names and aliases as the CLI. Its context also accepts optional `files` and `force` fields corresponding to the CLI flags, and setting `dryRun` lists changed files without writing them. It returns a `CodemodResult` containing `changedFiles` and rejects if the codemod cannot be run. The CLI's clean-worktree check also applies to programmatic runs.
