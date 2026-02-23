# AGENTS.md — Create Cloudflare (C3)

## OVERVIEW

Project scaffolding CLI for Cloudflare Workers. Single entry: `src/cli.ts` serves as CLI, library export, and bin target.

## STRUCTURE

- `src/cli.ts` — Main entry. Exports `main(argv)` for programmatic use, has shebang for direct execution
- `templates/` — Scaffolding templates (excluded from linting and most formatting)
- `scripts/build.ts` — esbuild-based build → `dist/cli.js`

## BUILD

- esbuild bundles `src/cli.ts` as CJS → `dist/cli.js`
- `package.json` `main`, `exports["."]`, and `bin` all point at `dist/cli.js`
- No separate bin shim — the built output IS the bin

## CONVENTIONS

- `no-console: error` — use project's logging utilities
- Own `.prettierrc` — same settings as root but without `prettier-plugin-packagejson`
- Templates excluded from linting (except `c3.ts` files within templates)
- Templates excluded from formatting (except hello-world templates)

## TESTING

- E2E tests run across pnpm/npm (yarn/bun also supported but not in CI), Linux/Windows
- Own vitest setup: mocks `log-update` and `@cloudflare/cli/streams`
- CI has experimental matrix for framework testing
- Python/UV installed in CI for Python framework E2E tests
