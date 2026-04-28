# Adding new APIs to explorer worker

1. Download the full Cloudflare OpenAPI Spec from https://github.com/cloudflare/api-schemas.
2. Add the new API to `miniflare/scripts/openapi-filter-config.ts`.
3. Run `OPENAPI_INPUT_PATH=<path> pnpm generate:api` to filter and generate types. Confirm the filtered API is as expected, and add ignores to `openapi-filter-config.ts` if necessary.
4. The explorer should have access to all user resource bindings. This is done by adding `proxyBindings` to the explorer worker in `getGlobalServices()` in the core plugin. You may also have to add entries to `CoreBindings.JSON_LOCAL_EXPLORER_BINDING_MAP` if you need to access resource config such as IDs or database names which aren't available at runtime on the binding itself.
5. Implement the APIs in
   `miniflare/src/workers/local-explorer/` using these bindings. You will have to register the routes in `explorer.worker.ts` and add handlers in `/local-explorer/resources/`.
6. Add tests for your API endpoint in `miniflare/tests/plugins/local-explorer/`.
7. Regenerate the UI's API client by running `pnpm build` in `packages/local-explorer-ui`.
8. Make any UI changes using your new API. The built output of the UI will be bundled into Miniflare when Miniflare is built.
