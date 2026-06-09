# Remote-bindings + Cloudflare Access repro (investigation for #14198)

A minimal, two-path reproduction for the remote-bindings-behind-Access question
raised in [#14198](https://github.com/cloudflare/workers-sdk/pull/14198) and
investigated in [#14234](https://github.com/cloudflare/workers-sdk/pull/14234).

It deliberately exercises **both** remote-binding proxy code paths in one
`wrangler dev` worker and reports each independently:

| Report key     | Binding call            | Proxy path                                |
| -------------- | ----------------------- | ----------------------------------------- |
| `ai`           | `env.AI.run(...)`       | HTTP `makeFetch` (wrapped fetcher)        |
| `serviceFetch` | `env.TARGET.fetch(...)` | HTTP `makeFetch` (service `.fetch`)       |
| `rpc`          | `env.TARGET.add(1, 2)`  | WebSocket `makeRemoteProxyStub` (capnweb) |

> This is a **manual, account-dependent** tool. It is not a workspace member and
> is not run in CI. The Access enforcement it tests happens at the real
> Cloudflare edge and cannot be faked locally.

## Layout

```
target/   # WorkerEntrypoint `Api.add` + default fetch — DEPLOY this to your account
dev/      # the worker you run with `wrangler dev` (remote AI + remote service binding)
```

## Prerequisites (account side — you do these)

1. **Auth**: `wrangler login` (or `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID`).
2. **Workers AI** enabled on the account. (If unavailable, swap the `ai` binding
   in `dev/wrangler.jsonc` + the `ai` call in `dev/src/index.js` for Vectorize or
   Images — any wrapped-fetcher binding exercises the same HTTP path.)
3. **Deploy the target worker** (needed for the remote service binding):
   ```bash
   cd target && node <repo>/packages/wrangler/bin/wrangler.js deploy
   ```
4. **Protect your account's `workers.dev` subdomain with Cloudflare Access**,
   with a **Service Auth** policy. (Dashboard → Zero Trust → Access.)
5. **Create a Service Token** and note its Client ID / Secret.

## Run protocol

The repro runs against the **locally built** wrangler so it reflects whatever
branch is checked out (this lets us compare `main` vs PR #14198 cleanly).

```bash
# (A) Build the branch under test (rebuilds wrangler + bundled miniflare + templates)
cd <repo>
git checkout main          # later: git checkout <pr-14198-ref>
pnpm build

# (B) Run the dev worker with debug logging
cd investigation/remote-access-repro/dev
export CLOUDFLARE_ACCESS_CLIENT_ID="<client-id>.access"      # set for scenarios B & D, unset for A & C
export CLOUDFLARE_ACCESS_CLIENT_SECRET="<client-secret>"
WRANGLER_LOG=debug node <repo>/packages/wrangler/bin/wrangler.js dev

# (C) In another shell, trigger all three paths
curl -s localhost:8787 | jq
```

### Scenario matrix

| #     | Branch    | Creds set? | Notes                                |
| ----- | --------- | ---------- | ------------------------------------ |
| A     | `main`    | no         | baseline — expect Access to block    |
| **B** | `main`    | **yes**    | **decisive** — does it already work? |
| C     | PR #14198 | no         | PR says fails                        |
| D     | PR #14198 | yes        | PR says works                        |

## What to capture each run

- The full JSON report from `curl` (per-path `ok`/`error`).
- These `WRANGLER_LOG=debug` lines from the terminal:
  - `Using Access Service Token headers for domain: <host>`
    (`packages/workers-auth/src/access.ts:111`) — proves the proxy session put
    service-token headers into `proxyData` for the `*.workers.dev` preview host.
  - Any `Cloudflare Access blocked a remote bindings request` warning
    (HTTP path only — added in #14011).
  - The temporary `[mf-access-debug] forward ...` lines (see below).

## Temporary ProxyWorker instrumentation (the smoking gun)

A throwaway debug log has been added to
`packages/wrangler/templates/startDevWorker/ProxyWorker.ts` (search for
`mf-access-debug`). For **every** request the local ProxyWorker forwards to the
`*.workers.dev` edge — HTTP **and** WebSocket upgrades — it logs the target URL,
whether it's an `Upgrade`, and whether the merged headers carry the Access
credentials + preview token:

```
[mf-access-debug] forward {"to":"https://...workers.dev/...","upgrade":"websocket","binding":"TARGET","hasAccessClientId":true,"hasCookie":false,"hasPreviewToken":true}
```

This directly answers the central question: **do the Access headers reach the
edge on the WS-upgrade hop?** It requires a `pnpm build` to take effect, and
**must be reverted before merge** (it is debug-only `console.log` in a template).

## Interpreting scenario B (the decisive run)

| JSON result                             | Conclusion                                                                    |
| --------------------------------------- | ----------------------------------------------------------------------------- |
| `ai.ok && serviceFetch.ok && rpc.ok`    | Existing path authenticates **all** paths → #14198's auth is redundant        |
| `ai.ok`, `rpc` fails w/ Access/WS error | WS path **not** authenticated by existing path → #14198's WS change justified |
| `ai` fails w/ `invalid_token`           | AI-upstream issue, **not** Cloudflare Access → #14198 misattributes           |
| `ai` fails w/ Access `403` HTML         | HTTP path unauthenticated → broader bug to hunt                               |

Cross-check against the `[mf-access-debug]` lines: if `hasAccessClientId` (or
`hasCookie`) is `true` on the WS-`upgrade` forward line, the edge hop is being
authenticated regardless of what the binding ultimately returns.
