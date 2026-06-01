# AGENTS.md — @cloudflare/wrangler-bundler

## Overview

esbuild-based dev server for Cloudflare Workers, extracted from
`wrangler dev` for projects that can't migrate to Vite. This is a
thin adapter on top of wrangler's `unstable_dev` API — it is NOT a
fork of wrangler internals.

The package ships a `cf-wrangler` delegate binary that dispatches on
a leading subcommand verb. Today the only verb is `dev`
(long-running esbuild + Miniflare + workerd dev server); future verbs
(`build`, `deploy`, etc.) will follow the same shape.

A parent process invokes `<pkgRoot>/bin/cf-wrangler dev [argv...]`,
the binary runs the dev server until Ctrl+C.

## Structure

- `bin/cf-wrangler` — executable shim; dispatches on the first argv
  token (`dev` today) and delegates to the matching handler.
- `src/index.ts` — programmatic API (`runDev`, `DevArgs`).
- `src/cli.ts` — `runDev` main loop: build `Unstable_DevOptions`,
  call `wrangler.unstable_dev`, block on `waitUntilExit`, wire signals.
- `src/args.ts` — argv parser for the `dev` verb. Built on
  `node:util.parseArgs` (strict mode → unknown flags throw; no
  third-party dependency).

## Conventions

- **Delegate to `unstable_dev`, not `unstable_DevEnv`.** `unstable_dev`
  wraps `startDev`, which already wires the remote-bindings auth
  hook (`requireAuth`/`requireApiToken`), `registerDevHotKeys`, and
  the DevEnv lifecycle. Building on the lower-level `unstable_DevEnv`
  would force us to duplicate that plumbing. The one wart: `host`
  is accepted at runtime by `startDev` but not declared on the
  public `Unstable_DevOptions` type, so the options object is
  type-cast at the `unstable_dev` call site. Tracked as a follow-up
  for wrangler to widen `Unstable_DevOptions`.
- **Remote bindings are supported.** Per-resource `remote = true` in
  `wrangler.jsonc` works out of the box because `unstable_dev`
  invokes the standard auth hook. Whole-worker remote dev
  (`wrangler dev --remote`) is NOT supported — there's no `--remote`
  flag here, and any attempt to pass it falls into the generic
  "unknown flag" error from the parser.
- **Hotkeys are enabled.** `experimental.showInteractiveDevSession:
true` turns on the standard wrangler hotkey UI
  (`b`/`d`/`e`/`r`/`l`/`c`/`x`/`q`). `unstable_dev` defaults this
  to `false` (suits its test-harness origin); we override to match
  `wrangler dev`. `startDev` only renders the UI when stdin is a
  TTY (`isInteractive()` check at `start-dev.ts:108`/`118`), so
  non-interactive parent processes (e.g. cf-dev with piped stdio)
  see no hotkey overlay. The bundler installs its own
  SIGINT/SIGTERM handlers as the teardown path for those cases.
- **Containers are enabled.** `experimental.enableContainers: true`,
  again to match `wrangler dev`'s default (`unstable_dev` defaults
  it to `false`). Cloudchamber-pulled `image_uri` containers work
  via the same auth flow that powers remote bindings.
- **`--mode` not `--env`.** Named environments are surfaced as
  `--mode <name>` to align with the cf-dev parent process's flag
  vocabulary; internally this maps to `unstable_dev`'s `env` option.
- **Minimal accepted flags.** Only `--config`, `--mode`, `--port`,
  `--host`, `--local` are recognised. Everything else belongs in
  the user's `wrangler.jsonc`. Do not mirror `wrangler dev`'s full
  surface — add flags here only when the cf-dev parent process
  needs to pass them through.

## Out of scope (v1)

- Pages assets shim (`enablePagesAssetsServiceBinding`).
- Cloudflare Sites (`legacy.site`).
- Multi-worker dev sessions (`MultiworkerRuntimeController`).
- Tunnel sharing (`startTunnel`).

## Build

- `tsdown` to ESM (`.mjs`) in `dist/`. Same bundler as `vite-plugin-cloudflare`.
- `pnpm build` for one-shot, `pnpm dev` for watch.
- The `bin/cf-wrangler` shim imports from `../dist/index.mjs`
  directly — it's NOT processed by tsdown (it's a tiny entry that
  doesn't need bundling and we want it readable for debugging).
- Only `wrangler` is externalized; everything else is bundled. See
  `scripts/deps.ts` for the allowlist (validated by the monorepo's
  `validate-package-dependencies` script).

## Testing

- `vitest` (default config, no special harness yet).
- Integration testing happens out-of-package via a parent process
  that spawns the `cf-wrangler` binary against a fixture project;
  that coverage is tracked separately from this repo.
