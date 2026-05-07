/**
 * Protocol constants shared between the Worker fetch handler and the
 * `AuthSession` Durable Object. Centralised so the regex / header names
 * stay in lock-step on both routes.
 */

/**
 * State validator. Both `/session/:state` and `/callback?state=` must
 * accept the same shape — the review (REVIEW-17452 #17) flagged that the
 * old `[a-zA-Z0-9._~-]+` regex on `/session` was uncapped and `/callback`
 * had no validation at all, allowing confused-deputy mismatches.
 *
 * 32–128 chars from the URL-safe RFC 3986 unreserved set. Wrangler
 * currently always generates a 32-char state; the upper bound future-proofs
 * the protocol for HKDF-derived states without permitting unbounded growth.
 */
export const STATE_REGEX = /^[A-Za-z0-9._~-]{32,128}$/;

/**
 * Custom header that authenticates Wrangler's WebSocket upgrade. Browsers
 * cannot set custom request headers on the `WebSocket` constructor, so the
 * presence of this header proves the upgrade did not originate from a
 * malicious page (REVIEW-17452 #13). The header value is also the
 * per-session `wsToken` used by the DO to bind a successful `/callback` to
 * the originating WebSocket — see Phase 3 of the security plan.
 */
export const WRANGLER_CLIENT_HEADER = "Sec-Wrangler-Client";

/**
 * Maximum size of `wsToken`, in characters. Must comfortably hold a
 * base64url-encoded 32-byte random value (43 chars) with headroom for
 * future format changes.
 */
export const WRANGLER_CLIENT_HEADER_MAX_LEN = 256;

/** WebSocket subrequest path used by the worker → DO loopback. */
export const DO_CONNECT_PATH = "/connect";

/** Callback subrequest path used by the worker → DO loopback. */
export const DO_CALLBACK_PATH = "/callback";

/**
 * Hard upper bound on a single `Headers` field value when forwarding into
 * the DO. The `wsToken` should be base64url(32B) = 43 chars; any client
 * sending more than `WRANGLER_CLIENT_HEADER_MAX_LEN` characters is treated
 * as malformed.
 */

/**
 * Required WebSocket subprotocol on every Wrangler upgrade. Browser-issued
 * WebSockets cannot easily forge a non-default subprotocol (it has to be
 * passed to the `WebSocket` constructor and is part of the upgrade
 * handshake), so requiring an exact match adds a defence-in-depth layer
 * on top of the `Sec-Wrangler-Client` check (REVIEW-17452 #37).
 *
 * Must be kept in lockstep with `WRANGLER_RELAY_SUBPROTOCOL` in
 * `packages/wrangler/src/user/auth-relay-constants.ts`.
 */
export const WRANGLER_RELAY_SUBPROTOCOL = "wrangler-auth-relay-v1";
