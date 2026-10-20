# AGENTS.md — Create Cloudflare (C3)

## OVERVIEW

Project scaffolding CLI for Cloudflare Workers. Main source entry: `src/cli.ts`. Bin entry: `bin/c3.js` (Node.js version gate shim).

## STRUCTURE

- `bin/c3.js` — Bin shim that checks Node.js version before requiring `dist/cli.js`
- `src/cli.ts` — Main entry. Exports `main(argv)` for programmatic use
- `templates/` — Scaffolding templates (excluded from linting and most formatting)
- `src/wrangler/` — Wrangler config, login, and account helpers
- `src/cf/` — Helpers for projects configured by `cloudflare.config.ts`, which use the `cf` CLI instead of Wrangler (detected with `usesCfCli`)
- `tsdown.config.ts` — Rolldown/Oxc build → `dist/cli.js`

## BUILD

- tsdown bundles `src/cli.ts` as CJS → `dist/cli.js`
- `package.json` `main` and `exports["."]` point at `dist/cli.js`; `bin` points at `bin/c3.js`
- `bin/c3.js` is a plain CommonJS shim that gates on Node.js version (read from `package.json` `engines.node`) before requiring `dist/cli.js`

## CONVENTIONS

- `no-console: error` — use project's logging utilities
- Templates excluded from linting (except `c3.ts` files within templates)
- Templates excluded from formatting (except hello-world templates)

## TESTING

- E2E tests run across pnpm/npm (yarn/bun also supported but not in CI), Linux/Windows
- Own vitest setup: mocks `log-update` and `@cloudflare/cli-shared-helpers/streams`
- CI has experimental matrix for framework testing
- Framework CI uses case shards within one test file (three normal, two experimental), controlled by `E2E_FRAMEWORK_SHARD`. Preserve coverage across every shard and keep shard selections in the test's Turbo cache inputs.
- Whole-framework tests retain one retry for transient failures in external registries, generators, and runtime startup. Per-case allowances live in `e2e/tests/frameworks/test-config.ts`; `E2E_TEST_RETRIES=0` disables retries for local investigations. Keep recovered attempts visible in retry reports and fix their causes before reducing allowances.
- Python/UV installed in CI for Python framework E2E tests
