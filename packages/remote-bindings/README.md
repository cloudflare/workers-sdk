# Shared authenticated development tooling

This package supplies host-side remote binding sessions and authentication to
Wrangler, the Cloudflare Vite plugin, and the Vitest plugin.

## Authenticated local development OIDC

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

### Consumer integration and native callback

`getDevelopmentOidcOptions()` supplies a lazy host broker for Workers with the
`workers_oidc` compatibility flag. Wrangler local development, `cf dev` delegates,
and the Cloudflare Vite plugin (dev and local preview) install it for each user
Worker. Miniflare owns the broker lifecycle: code reloads retain a session;
configuration changes and shutdown cancel and dispose it. Internal proxy, asset,
and helper Workers do not receive the broker.

The native `Worker.oidcTokenService` sends `POST /token` with `{}` or
`{"audience":"exact audience"}` and receives a compact JWT as `text/plain`.
Miniflare configures a private external service with a separate random capability
for each Worker and instance. It is absent from `env`, the dev registry, and the
Worker's outbound service. The callback checks the capability before reading a
bounded body; host exceptions never enter Worker responses. The ordinary shared
loopback credential alone cannot authorize issuance.

`createDevelopmentOidcApiTransport()` uses the existing Cloudflare API request
helper with explicit human OAuth credentials and redirect refusal. Its v4 routes
map to EWC's `/api/scripts/...` and `/api/oidc/...` handlers:

- `POST /accounts/{account}/workers/scripts/{name}/oidc/development-sessions`, body
  `{}`, returns server account, Worker, user, session, policy, default audience and
  session expiry.
- `POST /accounts/{account}/workers/oidc/development-sessions/{session}/tokens`, body
  `{"audience":"exact audience"}`, returns `token` and `expires_at`.

Responses use the usual Cloudflare `success`/`result` envelope. Bodies are capped
at 128 KiB before JSON decoding. The adapter validates server identity, session
bounds, exact audience, workload JOSE header, development claims and lifetime. It
never fetches a token-supplied URL. Error responses are cancelled without decoding
or logging their body. A validated session's development subject is displayed in
the host dev server. Expiring sessions are recreated on the next getter.

### Vitest and offline mocks

Live issuance is disabled by default, independently of `remoteBindings`. Opt in
explicitly in the Workers pool options passed to `cloudflareTest()`:

```ts
cloudflareTest({
	wrangler: { configPath: "./wrangler.jsonc" },
	developmentOidc: true,
});
```

An offline test can instead supply a host-side broker through
`miniflare.developmentOidc` (modern Miniflare uses `workers[].dev.developmentOidc`):

```ts
miniflare: {
  developmentOidc: {
    key: "offline-test",
    create: () => ({
      getToken: async () => fixtureJwt,
      dispose() {},
    }),
  },
}
```

The mock must return a compact JWT; it need not use Cloudflare or real keys. No
OAuth credentials or host callback are exposed to the test Worker. Explicit local
DO object/namespace subjects are rejected by workerd; default local DO getters
share the linked Worker's development identity.

### Upstream release dependencies

The checked-in workerd npm pin predates `oidcTokenService`. Until the matching
runtime is published, use its local build through `MINIFLARE_WORKERD_PATH` for
integration development. `scripts/generate-workerd-config.mjs` generates the
configuration serializer from the pinned schema plus this additive upstream
field; remove the supplement when updating the runtime pin. The native broker
suite runs when that override is provided. This does not enable the feature in
an older runtime.

Cloudflare must publish the two v4 gateway routes and deploy EWC's development
session handlers, session migration, human OAuth verifier and constrained
Edgeworker signer. The backend draft now wires its OAuth verifier and checks
current Worker access and grant limits with IAM. Key provisioning, account opt-in
and IAM confirmation of the permission/scope mapping remain rollout dependencies
owned outside workers-sdk; mocked API and local native tests cannot prove live
service authorization.
