# @cloudflare/workers-auth

## 0.2.0

### Minor Changes

- [#14185](https://github.com/cloudflare/workers-sdk/pull/14185) [`98c9afe`](https://github.com/cloudflare/workers-sdk/commit/98c9afe2e3bb6cbed6d56d8ad781d50e9a604926) Thanks [@penalosa](https://github.com/penalosa)! - Make the OAuth identity and token storage injectable, and add a shared env-credential resolver

  `createOAuthFlow` now takes the consumer's OAuth identity (`clientId`, `consent`, `redirectUri`) and token `storage` on its context, so other Cloudflare CLIs can reuse the flow under their own OAuth app and store tokens in their own location/format. Also adds a shared env→credential resolver (`getAuthFromEnv`, `getAPIToken`, `requireApiToken`).

### Patch Changes

- [#14213](https://github.com/cloudflare/workers-sdk/pull/14213) [`10b5538`](https://github.com/cloudflare/workers-sdk/commit/10b553819addbcd1224f66d5b52bb7c7f7c8e602) Thanks [@dario-piotrowicz](https://github.com/dario-piotrowicz)! - Improve authentication error messages with specific failure reasons

  When authentication fails (e.g. during `wrangler dev --remote` or when using remote bindings), the error message now explains exactly what went wrong -- whether no credentials were found, the token expired, or the environment is non-interactive -- and lists actionable steps to fix it, including a `wrangler whoami` tip.

  Previously, auth failures could produce multiple confusing errors (e.g. "Failed to fetch auth token: 400 Bad Request" followed by "Failed to start the remote proxy session"). Now a single, clear error is shown.

## 0.1.1

### Patch Changes

- [#14121](https://github.com/cloudflare/workers-sdk/pull/14121) [`7539a9b`](https://github.com/cloudflare/workers-sdk/commit/7539a9bfcf03a14b2c16f281d541b6bc45523a80) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - Extract the OAuth 2.0 + PKCE flow into a new `@cloudflare/workers-auth` package.

  The OAuth login / logout / refresh logic, the auth-config TOML file IO, the OAuth token exchange + local callback server, and the Cloudflare Access detection helpers that previously lived in `packages/wrangler/src/user/` have moved to the new internal-only `@cloudflare/workers-auth` package. Wrangler now wires the OAuth flow up via a small glue module that injects its logger, browser opener, interactivity detector, and config cache via a dependency- injection context.

  What stays in wrangler:

  - The yargs `login` / `logout` / `whoami` / `auth token` commands
  - Environment-based credential resolution (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_API_KEY` / `CLOUDFLARE_EMAIL`, etc.)
  - Cloudflare account selection (`requireAuth`, `getOrSelectAccountId`)
  - The OAuth scope catalog (passed into the OAuth flow as a generic `string[]`)
  - `whoami` / account fetching

  No behavior change for end users. The on-disk TOML format and location remain identical, and all telemetry message labels are preserved verbatim.

  `@cloudflare/workers-auth` is published with `prerelease: true` and is not intended for external use — its APIs may change without notice.

- [#14170](https://github.com/cloudflare/workers-sdk/pull/14170) [`ea12b58`](https://github.com/cloudflare/workers-sdk/commit/ea12b584ee1c3141286f0ecf6b742bd79971407e) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - Tighten on-disk permissions of the OAuth credentials file to `0600`

  The user auth config file written by `wrangler login` (typically `~/.config/.wrangler/config/default.toml` on Linux/macOS, or `<environment>.toml` for non-production Cloudflare API environments) is now written with mode `0600` and re-`chmod`-ed on every save. This prevents other local users on shared hosts from reading the stored OAuth tokens. Existing files with looser permissions written by older Wrangler versions are tightened the next time Wrangler refreshes the token or the user logs in again. The change is a no-op on Windows, which does not honour POSIX mode bits.

- [#14022](https://github.com/cloudflare/workers-sdk/pull/14022) [`acf7817`](https://github.com/cloudflare/workers-sdk/commit/acf7817266b39be9707a09b918d670a468302ebc) Thanks [@petebacondarwin](https://github.com/petebacondarwin)! - Show the actual OAuth error instead of hanging when `wrangler login` is rejected by the OAuth provider (for example with `invalid_scope`).

  Previously, if the OAuth callback returned with an `error` other than `access_denied`, Wrangler would never respond to the browser. Because `server.close()`'s callback only fires once all open connections have ended, the login command would hang until the 120 second OAuth timeout — at which point it would print a generic timeout message rather than the actual OAuth failure. The same gap existed for the case where the OAuth provider redirected back without an authorisation code, and for failures during the auth-code-to-access-token exchange.

  The OAuth provider's `error_description` (RFC 6749 §4.1.2.1) is now also surfaced, so the message includes the specific reason for the failure rather than just the bare `error` code. For example, a misconfigured staging scope now surfaces as:

  ```
  OAuth error: invalid_scope
    The OAuth 2.0 Client is not allowed to request scope 'browser:write'.
  ```

  instead of hanging silently.

- Updated dependencies [[`c6c61b5`](https://github.com/cloudflare/workers-sdk/commit/c6c61b59431443b2bcda25f3af7624dd2ce19b9b), [`b502d54`](https://github.com/cloudflare/workers-sdk/commit/b502d5445b9e9e030020a3d65c0334507393aa64), [`c4f45e8`](https://github.com/cloudflare/workers-sdk/commit/c4f45e8b8694c60fb1808f7fbb130e4b4893d20c)]:
  - @cloudflare/workers-utils@0.23.0
