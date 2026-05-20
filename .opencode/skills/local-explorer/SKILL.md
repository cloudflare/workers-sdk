---
name: local-explorer
description: How to add products/resources to the local explorer or local API. Use when implementing new local APIs, or UI routes under packages/miniflare/src/workers/local-explorer or packages/local-explorer-ui.
---

# Cloudflare Local Explorer Products

Use this skill when adding a new product or resource type to the local API and/or local explorer.

## Start Here

Read these files before editing:

- `packages/miniflare/src/workers/local-explorer/explorer.worker.ts`
- `packages/miniflare/src/plugins/core/explorer.ts`
- `packages/miniflare/src/plugins/core/types.ts`
- One existing resource implementation in `packages/miniflare/src/workers/local-explorer/resources/`, preferably the product most similar to the new one
- One matching test in `packages/miniflare/test/plugins/local-explorer/`

If there are UI changes, also read:

- `packages/local-explorer-ui/src/components/Sidebar.tsx`
- Existing route files under `packages/local-explorer-ui/src/routes/`
- Existing product e2e tests under `packages/local-explorer-ui/src/__e2e__/`

## Workflow

1. Add the API surface to `packages/miniflare/scripts/openapi-filter-config.ts`.
2. Generate Miniflare's filtered spec and backend types from a full Cloudflare OpenAPI spec:

```bash
OPENAPI_INPUT_PATH=<path-to-full-openapi-spec> pnpm --dir packages/miniflare generate:api
```

3. Inspect `packages/miniflare/src/workers/local-explorer/openapi.local.json` and generated types. If the generated schemas include fields local explorer will not support, add ignores in `openapi-filter-config.ts` and regenerate.
4. The explorer worker should have access to all user resource bindings. Ensure `proxyBindings` include bindings to the new product and that `getExplorerServices()` exposes any extra bindings the explorer worker needs. Wire product bindings through `constructExplorerBindingMap()` and `constructExplorerWorkerOpts()` in `packages/miniflare/src/plugins/core/explorer.ts`.
5. Add or extend resource binding metadata in `packages/miniflare/src/plugins/core/types.ts`.
6. Implement handlers in `packages/miniflare/src/workers/local-explorer/resources/<product>.ts`. Make sure to account for cross-instance aggregation, if applicable.
7. Register Hono routes in `packages/miniflare/src/workers/local-explorer/explorer.worker.ts`.
8. Validate request bodies and query params with generated Zod schemas from `generated/zod.gen.ts` using `validateRequestBody()` and `validateQuery()`.
9. Return Cloudflare API envelope responses using `wrapResponse()` and `errorResponse()` from `common.ts` unless an existing endpoint for that product uses a different response shape.
10. Add Miniflare tests in `packages/miniflare/test/plugins/local-explorer/<product>.spec.ts`.
11. Regenerate the UI API client:

```bash
pnpm --dir packages/local-explorer-ui build
```

12. Add UI routes/components. Use Kumo components for new UI. See https://github.com/cloudflare/kumo/blob/main/AGENTS.md.
13. Add Playwright e2e tests under `packages/local-explorer-ui/src/__e2e__/<product>/` for new visible product flows.

## OpenAPI Rules

- Do not edit generated files like `packages/miniflare/src/workers/local-explorer/openapi.local.json` or `packages/miniflare/src/workers/local-explorer/generated/` directly.
- Prefer upstream Cloudflare API paths when a public API exists.
- Use `extensions.paths` in `openapi-filter-config.ts` only for local-only APIs or APIs that do not exist in the public Cloudflare API.
- Add ignores for unsupported params, headers, request body properties, and response fields rather than pretending to support them.

## Backend Patterns

- Local list endpoints such as listing KV namespaces should not implement pagination as this may require cross-instance aggregation. Pagination should be supported when targeting individual resources, such as listing KV keys within a specific namespace.
- For cross-worker aggregation, use `aggregateListResults()`, `getPeerUrlsIfAggregating()`, and `fetchFromPeer()` from `aggregation.ts`; do not hand-roll peer discovery. Add tests for both local-only behavior and aggregated behavior when the product can span multiple instances.
- If an API needs direct filesystem access, call through the loopback service (`c.env.MINIFLARE_LOOPBACK`) to a Node.js endpoint. The local explorer API runs inside workerd, so it cannot access the host filesystem directly.
- If an endpoint needs metadata that is not available on the runtime binding itself, put that metadata in `BindingIdMap` and pass it through `CoreBindings.JSON_LOCAL_EXPLORER_BINDING_MAP`.
- If a product should appear in `/api/local/workers`, add it to `WorkerResourceBindings` and populate it in `constructExplorerWorkerOpts()`.

## UI Patterns

- The UI API client is generated from `packages/miniflare/src/workers/local-explorer/openapi.local.json` into `packages/local-explorer-ui/src/api/generated/`.
- Sidebar resources come from `/api/local/workers`; update `LocalExplorerWorkerBindings` usage and `Sidebar.tsx` when the product should appear in navigation.
- Add route files under `packages/local-explorer-ui/src/routes/`. TanStack Router regenerates `src/routeTree.gen.ts` during UI build/dev.
- Preserve worker selection by carrying the `worker` search param through product links when following sidebar patterns.
- Use Kumo for new UI components wherever possible. Do not introduce a parallel component system.
- Do not use tailwindCSS color tokens, use Kumo color tokens instead.
