# AGENTS.md — Create Cloudflare (C3)

## OVERVIEW

Project scaffolding CLI for Cloudflare Workers. Main source entry: `src/cli.ts`. Bin entry: `bin/c3.js` (Node.js version gate shim).

## STRUCTURE

- `bin/c3.js` — Bin shim that checks Node.js version before requiring `dist/cli.js`
- `src/cli.ts` — Main entry. Exports `main(argv)` for programmatic use
- `templates/` — Scaffolding templates (excluded from linting and most formatting)
- `scripts/build.ts` — esbuild-based build → `dist/cli.js`

## BUILD

- esbuild bundles `src/cli.ts` as CJS → `dist/cli.js`
- `package.json` `main` and `exports["."]` point at `dist/cli.js`; `bin` points at `bin/c3.js`
- `bin/c3.js` is a plain CommonJS shim that gates on Node.js version (read from `package.json` `engines.node`) before requiring `dist/cli.js`

## CONVENTIONS

- `no-console: error` — use project's logging utilities
- Templates excluded from linting (except `c3.ts` files within templates)
- Templates excluded from formatting (except hello-world templates)

## TESTING

- E2E tests run across pnpm/npm (yarn/bun also supported but not in CI), Linux/Windows
- Own vitest setup: mocks `log-update` and `@cloudflare/cli/streams`
- CI has experimental matrix for framework testing
- Python/UV installed in CI for Python framework E2E tests
