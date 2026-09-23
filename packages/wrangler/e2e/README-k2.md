# K2 producer binding E2E tests

PIPE-847 covers K2 producer bindings plus stream create/list/get/delete commands. The test file is `e2e/k2.test.ts`.

The credential-free tests exercise the built Wrangler CLI: configuration shape/type validation, self-contained type generation, dry-run deployment, and rejection of unsupported local simulation. A loopback API server additionally checks create/get/list/delete requests with an opaque stream identifier, authorization headers, JSON output, pagination, and non-interactive deletion confirmation through real CLI processes. Stream identifier formats and stream-name rules are validated by the backend. Run them after building Wrangler and its dependencies:

```sh
pnpm build --filter=wrangler
pnpm --filter wrangler exec vitest run --config e2e/vitest.config.mts e2e/k2.test.ts
```

The live stream-management suite follows Wrangler's standard remote E2E setup: it runs when `CLOUDFLARE_ACCOUNT_ID` is provided. It creates a unique stream through `wrangler k2 streams create`, checks discovery with get/list, deletes it through `wrangler k2 streams delete --force --json`, and verifies that get/list no longer find it. Teardown also removes the stream if the test fails before deletion. It does not deploy a Worker or send records.

The four live producer cases (`getPlatformProxy`, deploy, versions, and dev) use the same `CLOUDFLARE_ACCOUNT_ID` gate. They run when account credentials are supplied; passing management or local tests alone is not producer validation.

The producer suite creates a stream, deploys a temporary producer Worker (or starts remote development), and appends bytes and headers through the binding, checking each send result and invalid-record failures. The version-upload case creates and activates a new version before appending. Teardown removes the Worker and stream using the existing Worker cleanup and stream-management API. This follows the existing remote-binding E2E pattern, including the Pipelines fixture that calls `env.PIPELINE.send()`; the shared test account also needs K2 access.

Use the existing [DevProd Testing CI account](README.md#running-against-the-ci-account). A new K2-specific account is not required. The account must have K2 enabled and the CI token must include the permissions below alongside its existing grants. The production Gateway, EWC binding, Core, and Superbuffer read path must be available together; beta permissions can be used before GA. Set these environment variables without checking secrets into the repository:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN` with K2 Config Write (including Read) access; the producer cases also require Worker deployment permissions
- `E2E_ACCOUNT_WORKERS_DEV_DOMAIN` for the test account's Workers subdomain, if different from the shared E2E default
- For Access-protected Worker or preview URLs, `CLOUDFLARE_ACCESS_CLIENT_ID` and `CLOUDFLARE_ACCESS_CLIENT_SECRET` for a service token allowed by a Service Auth policy on the matching hostname-based Access application. The account API token does not authenticate Access. Wrangler uses these variables for remote bindings, and the producer E2E sends them only to the expected deployed Worker URL. If required in CI, the workflow must also expose the service-token secrets to the test step; it currently supplies only the account API credentials. Stream-management tests do not need an Access service token.

For the account-scoped K2 permissions, a user-owned API token can use beta permission groups by ID even when they are hidden from discovery. Provision K2 Config Write by its production permission-group ID through the API; beta IAM enrollment is not required for this user-owned-token path. Account-owned tokens require enrollment while these roles remain beta. Obtain the IDs from the feature owners rather than assuming hidden roles appear in the public permission list.

Preserve the shared CI token's existing grants, or replace `TEST_CLOUDFLARE_API_TOKEN` if a new token is issued. Enabling K2 does not add token grants. The producer binding does not require a K2 Produce token grant; add that grant only for tests that call the authenticated HTTP Produce API directly.

The live tests reuse the standard CI credential; they do not require a separate K2 token. Stream creation and cleanup require K2 Config Write. Producing through the Worker binding uses the capability established during upload, without a K2 Produce bearer token. Direct HTTP Produce can be anonymous on a stream created with `--no-http-auth`; that setting does not remove authorization from stream management. Interactive CLI commands can use a Wrangler OAuth login with K2 scopes instead of a custom API token.

Direct authenticated HTTP Produce E2E coverage is deferred until K2 permissions reach GA, and verifying persisted records through Consume is deferred until the Consume API ships. The producer suite checks only the binding's send results; it does not verify persisted content or HTTP Produce authentication.

Run the same command above. Without an account ID, only the local tests run. Once an account ID is supplied, stream management and all four producer cases run. A missing token, insufficient permissions, or an unavailable backend fails explicitly. Those cases write real records and create temporary Workers and streams. They are not a benchmark or a retention/deletion-semantics test.

GitHub CI supplies the shared `TEST_CLOUDFLARE_ACCOUNT_ID` and `TEST_CLOUDFLARE_API_TOKEN` secrets through the existing remote-test workflow. Use the `ci:run-remote-tests` PR label to request a run before the merge queue, as described in [CONTRIBUTING.md](../../../CONTRIBUTING.md#remote-e2e-tests-in-ci). Fork PRs require the maintainers' existing workflow for running CI on behalf of external forks; the label alone cannot expose repository secrets to a fork. There is no additional K2-specific opt-in flag. All live cases must pass on the shared CI account before producer-binding beta launch sign-off.

The live suite uses production API endpoints. A Wrangler named environment such as `--env staging` does not select Cloudflare's internal staging infrastructure. Do not point these tests at an internal staging deployment by changing only a named environment.

The producer binding's remote transport is additionally covered without Cloudflare credentials in `packages/miniflare/test/plugins/k2/index.spec.ts`, using workerd and a local WebSocket RPC server. Only all-`ArrayBuffer` batches are converted to `Uint8Array` for transport. Mixed batches reject during serialization without reaching the producer, instead of returning the deployed binding's structured K2 error. Callers must handle rejected RPC promises as well as returned failure results. Shared configuration is used by Wrangler, the Vite plugin, and the Vitest plugin; no tool-specific K2 storage implementation is introduced.

For custom-token onboarding, use `CLOUDFLARE_API_TOKEN`. Default Wrangler logins request `k2.read` for lookup/binding upload and `k2.write` for stream creation/deletion alongside the ordinary deployment scopes. Existing OAuth users must run `wrangler login` again to grant the new permissions; refreshing an existing token does not automatically add scopes. Verify that the production Wrangler OAuth application can request and receive both K2 scopes before releasing this change. Local auth tests mock the authorization server and do not establish production registration or consent.

## CLI onboarding

```sh
wrangler k2 streams create order_events --retention-seconds 86400
wrangler k2 streams list --name order --page 1 --per-page 25
wrangler k2 streams get <stream-id> --json
wrangler k2 streams delete <stream-id>
```

Copy the binding snippet printed by create into the appropriate named environment and replace `YOUR_BINDING_NAME` with your chosen Worker binding name (for example, `EVENTS` for `env.EVENTS`), then run `wrangler types` and `wrangler deploy`. The snippet already contains the stream ID; the stream name is not required in the configuration. Like the dashboard, HTTP ingestion is disabled by default. Pass `--http-enabled` to enable authenticated HTTP ingestion; combine it with `--no-worker-binding-enabled` for an HTTP-only stream. Disabling both inputs is rejected. A list command reads one page; its JSON output is an array, matching the Pipelines CLI pattern.

Deletion takes a stream ID and defaults to cancellation unless confirmed. Use `--force` (or `-y`) to skip confirmation. JSON deletion requires `--force --json` and returns `{ "id": "<stream-id>", "deleted": true }` after a successful API response. Stream deletion errors fail the command; an unknown deletion outcome is not retried automatically.
