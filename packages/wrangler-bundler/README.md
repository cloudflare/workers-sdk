# @cloudflare/wrangler-bundler

esbuild-based dev server for Cloudflare Workers — extracted from
`wrangler dev` for projects that can't migrate to Vite.

> **Use [`@cloudflare/vite-plugin`](https://www.npmjs.com/package/@cloudflare/vite-plugin)
> instead** if your project uses Vite. The Vite plugin is the
> recommended JavaScript/TypeScript dev-server impl going forward.
> `@cloudflare/wrangler-bundler` is provided for legacy projects whose
> build pipeline depends on esbuild semantics.

## What this package is

A thin adapter on top of wrangler's `unstable_dev` API. It ships a
`cf-wrangler` delegate binary that exposes a small CLI dispatched on
a leading subcommand verb. Today it accepts only `dev` (long-running
esbuild + Miniflare); future verbs (`build`, `deploy`) will follow
the same shape.

A parent CLI (typically a project's chosen tool) is expected to
discover this package in `devDependencies` and spawn the
`cf-wrangler dev` subcommand on its behalf. You can also invoke
`./node_modules/.bin/cf-wrangler dev` directly.

## Installation

```sh
npm install --save-dev @cloudflare/wrangler-bundler
```

## CLI

```sh
cf-wrangler dev [flags]
```

The accepted flag set is deliberately minimal. Everything else
belongs in your `wrangler.jsonc` / `wrangler.toml`.

| Flag       | Description                                                                                          |
| ---------- | ---------------------------------------------------------------------------------------------------- |
| `--config` | Path to `wrangler.jsonc` / `wrangler.toml`. Defaults to wrangler's standard config-discovery search. |
| `--mode`   | Named environment (`[env.X]` in your config). Maps to wrangler's `env` option.                       |
| `--port`   | Listen port for the dev server. Integer 0–65535 (0 = OS-assigned).                                   |
| `--host`   | Acts-as-origin hostname override (the `Host` header your Worker sees).                               |
| `--local`  | Force local execution even if `dev.remote` is set in config.                                         |

Unknown flags are rejected at parse time with a clear error.

## What it supports

- `wrangler.jsonc` / `wrangler.toml` config files (incl. named
  environments via `--mode`)
- esbuild-based bundling (via wrangler's internals)
- Miniflare + workerd local runtime
- Dev registry registration (multi-session dev)
- **Remote bindings** — set `remote = true` on individual resources
  in your wrangler config to access remote Cloudflare resources from
  local code. Uses the standard wrangler auth flow
  (`wrangler login` / `CLOUDFLARE_API_TOKEN`).
- **Interactive hotkeys** in a TTY session
  (`b`/`d`/`e`/`r`/`l`/`c`/`x`/`q`) — same as `wrangler dev`.
- **Containers** — both `image = "..."` (local build) and
  `image_uri = "..."` (Cloudchamber-pulled) work, via the same
  auth flow as remote bindings.

## What it does NOT support

- **Whole-worker remote dev** (`wrangler dev --remote`). For remote
  bindings, use the per-resource `remote = true` field instead — no
  flag needed.
- `--tunnel` (use `wrangler dev --tunnel` directly).
- Cloudflare Pages and Sites.
- Multi-worker dev sessions.
- The rest of `wrangler dev`'s flag surface (`--var`, `--define`,
  `--assets`, `--tsconfig`, `--persist-to`, `--live-reload`, etc.).
  These all have equivalents in `wrangler.jsonc` — configure them
  there.

For any of these, run `wrangler dev` directly.
