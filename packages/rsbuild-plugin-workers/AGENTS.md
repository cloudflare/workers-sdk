# AGENTS.md - rsbuild-plugin-workers

## Overview

Experimental Rsbuild adapter for Cloudflare Workers. Exports `cloudflare()` from
`src/index.ts`. ESM-only output.

## Structure

- `src/index.ts` - Rsbuild plugin factory and hook wiring
- `src/config.ts` - Wrangler config resolution and plugin options
- `src/rsbuild-config.ts` - Worker environment config for Rsbuild/Rspack
- `src/miniflare.ts` - Miniflare option assembly and lifecycle wrapper
- `src/output.ts` - deployable Wrangler config emission
- `src/http.ts` - Rsbuild dev-server request/response bridge
- `src/__tests__/` - Vitest unit/integration coverage

## Conventions

- Mirror `packages/vite-plugin-cloudflare` behavior where practical.
- Keep Wrangler imports as `import * as wrangler from "wrangler"`.
- Prefer a thin adapter until shared Vite/Rsbuild helpers are extracted.
- Add fixture-style tests when changing generated output or dev-server behavior.

## Commands

- `pnpm --filter @cloudflare/rsbuild-plugin-workers check:type`
- `pnpm --filter @cloudflare/rsbuild-plugin-workers test:ci`
- `pnpm run build --filter @cloudflare/rsbuild-plugin-workers`
