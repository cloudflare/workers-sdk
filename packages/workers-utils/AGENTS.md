# AGENTS.md — workers-utils

## OVERVIEW

Shared utility package used across wrangler, miniflare, and others. Two main areas: config validation and test helpers.

## STRUCTURE

- `src/config/` — Configuration types, validation, normalization
  - `validation.ts` — The config normalizer (large file). Central to all wrangler config processing.
  - `environment.ts` — Environment/config field definitions (many deprecated fields)
  - `config.ts` — Config types
- `src/test-helpers/` — Shared test utilities used across packages
- `src/types.ts` — Shared type definitions

## KEY EXPORTS

### Config

- Validation pipeline normalizes wrangler.json/toml into typed config objects
- Used by wrangler for all config loading

### Test Helpers

- `runInTempDir()` — Creates temp dir, chdir's into it, stubs HOME/XDG_CONFIG_HOME, cleans up
- `seed(files)` — Writes `Record<string, string>` of path->content into temp dir
- `writeWranglerConfig()` / `readWranglerConfig()` — Mock wrangler config files (TOML, JSON, JSONC)
- `mockConsoleMethods()` — Spies on console, returns normalized output with `.debug`, `.out`, `.info`, `.err`, `.warn`
- `normalizeString()` — Multi-stage pipeline: strips timings, thin spaces, temp dirs, normalizes slashes/cwd/dates/tables/error markers/byte values

## NOTES

- `validation.ts` is the largest single file in the monorepo after generated code — changes here affect all config processing
- Many deprecated fields in `environment.ts` — check `@deprecated` annotations before modifying
- Test helpers imported as `@cloudflare/workers-utils/test-helpers` across packages
