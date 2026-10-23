# Shared authenticated development tooling

This package supplies host-side remote binding sessions and authentication to
Wrangler, the Cloudflare Vite plugin, and the Vitest plugin.

## Development OIDC primitives

`getDevelopmentOidcAuthHook()` resolves the selected cf or Wrangler profile and
reads its human OAuth credentials on demand. API tokens, global keys, and temporary
accounts cannot substitute for a developer's OAuth login. A parent `cf dev`
process forwards its explicit profile through `CLOUDFLARE_DEV_AUTH_PROFILE`, with
`CLOUDFLARE_CF_AUTH` selecting cf credential storage. Neither variable contains
credentials. Account discovery uses that same OAuth credential even when an
unrelated API token is present in the environment.

`DevelopmentOidcProvider` owns one linked Worker's authenticated development
session. Keep it across code reloads and dispose it on shutdown or Worker
configuration changes. It rereads authentication on each getter, clears its cache
and cancels outstanding requests when credentials change, and rejects explicit
local DO object/namespace subjects. It is independent of remote bindings: a
Worker with no remote bindings still needs its own development identity.

The provider uses Miniflare's `DevelopmentOidcTokenCache`. The cache separates
account, Worker, user, development session, policy, and effective audience. It
coalesces requests, bounds memory and concurrent issuance, and returns tokens only
while at least 60 seconds remain. Renewal happens on demand, with no idle polling
and no stale-token fallback. Cached lifetime also uses a monotonic deadline so a
wall-clock rollback cannot extend it. Identity fields are capped at 4 KiB each,
audiences at 2,048 UTF-8 bytes, and token strings at 64 KiB. Metadata and issuance
responses are copied into immutable snapshots; credential-bearing provider state
uses JavaScript private fields.

Each cache and provider permits at most 128 waiting getters. Each host request
pool permits at most 128 underlying operations and imposes a 30-second deadline.
Invalidation and shutdown reject waiting callers immediately. Operations that
ignore abort retain their concurrency slot until they settle, including across
cache clears; the pool fails closed if all slots are stuck. These are initial
host-side limits, not Cloudflare's issuance rate limits, and need validation with
real adapters and load tests. A transport must honor cancellation and bound HTTP
response bodies before decoding them; these primitives cannot reclaim resources
owned by a misbehaving adapter.

`DevelopmentOidcTransport` is the host-only adapter contract. It must call the
authorized Cloudflare development API, use human OAuth, and validate the returned
development token profile before returning a token. Cloudflare must resolve the
Worker and user and create the session; local config and transport inputs grant
no signing authority. Never log the OAuth credential or returned bearer token,
and never sign development tokens locally.

### Remaining integration dependencies

These primitives alone do **not** enable `ctx.oidc.getToken()` in local workerd.
The following integration work requires the matching upstream contracts:

- Add the concrete Cloudflare transport when the development session/issuance
  route and request/response contract are available. Map sign-in, Worker permission,
  network, rate-limit, and signing failures without logging response tokens.
- Connect Miniflare's per-Worker native getter callback using the matching workerd
  service configuration and protocol. Use its authenticated internal loopback;
  expose no issuance route on the application's public dev server. Update the
  workerd pin and regenerate schema/types from that release.
- Retain one provider per user Worker in Wrangler's local and multiworker runtime
  controllers and the Vite dev-server lifecycle. Exclude internal proxy, runner,
  asset, and helper Workers. Show the server-authorized development subject.
- Add a separate, default-off live-issuance opt-in in Vitest. Offline tests inject
  mocks. Enabling remote bindings must not implicitly enable live OIDC issuance.
- Prove the native getter end to end for Workers and local Durable Objects,
  including service/RPC calls, Worker isolation, credential changes, cancellation,
  and renewal/failure behavior. Vite core requires no change.

Until those integrations are complete, native local issuance remains unsupported
through Wrangler, Vite, and Vitest. The mock transport tests cover only the shared
host-side provider and cache, not the runtime or a live Cloudflare endpoint.
