/**
 * Build-time constants for the WebSocket auth-relay flow used by
 * `wrangler login --experimental-websocket-callback`.
 *
 * These values are bundled into `wrangler-dist/cli.js` by tsup at build time
 * and cannot be overridden at runtime via environment variables, dotfiles,
 * devcontainer config, or AI-agent prompt injection. See REVIEW-17452 for the
 * security review that drove this — the previous `WRANGLER_AUTH_WORKER_ORIGIN`
 * and `WRANGLER_AUTH_WORKER_TIMEOUT` runtime overrides were removed because
 * they enabled MITM (override the origin to a hostile relay) and
 * hang-amplification (`TIMEOUT=0` disabled the connect timer entirely).
 */

/**
 * Origin (scheme + host, no path) of the auth relay worker. A single
 * deployment serves all environments — the worker is environment-agnostic
 * because it relays opaque codes and never talks to Cloudflare's OAuth
 * endpoints, so the same instance works for both production and staging
 * Wrangler.
 */
export const AUTH_WORKER_ORIGIN = "https://auth.devprod.cloudflare.dev";

/**
 * Connect timeout (ms) for the auth-relay WebSocket. Always armed; there is
 * no way to disable it. On timeout, Wrangler falls back to the localhost
 * callback flow (suitable for laptops where localhost is reachable from the
 * browser).
 */
export const AUTH_RELAY_CONNECT_TIMEOUT_MS = 5_000;

/**
 * Custom request header that authenticates Wrangler's WebSocket upgrade.
 * Browsers cannot set custom request headers on `new WebSocket(url)`, so the
 * presence of this header proves the upgrade did not originate from a
 * malicious page (REVIEW-17452 #13). The header value is also the
 * per-session `wsToken` used by the DO to scope a successful `/callback` to
 * the originating WebSocket. Must be kept in lockstep with
 * `packages/cf-auth-worker/src/protocol.ts`.
 */
export const WRANGLER_CLIENT_HEADER = "Sec-Wrangler-Client";

/**
 * Max payload (bytes) the `ws` package will accept on a single frame.
 * The protocol-defined message is `{ code: string, state: string }` (or
 * the `error` variant) — well under 1 KiB. The 4 KiB cap protects against
 * a compromised relay sending a giant payload that would OOM Wrangler
 * (REVIEW-17452 #27).
 */
export const WS_MESSAGE_MAX_PAYLOAD_BYTES = 4 * 1024;

/**
 * Required WebSocket subprotocol on every Wrangler upgrade. Browser-issued
 * WebSockets cannot easily forge a non-default subprotocol, so requiring an
 * exact match adds a defence-in-depth layer on top of the
 * `Sec-Wrangler-Client` check (REVIEW-17452 #37).
 *
 * Must be kept in lockstep with `WRANGLER_RELAY_SUBPROTOCOL` in
 * `packages/cf-auth-worker/src/protocol.ts`.
 */
export const WRANGLER_RELAY_SUBPROTOCOL = "wrangler-auth-relay-v1";
