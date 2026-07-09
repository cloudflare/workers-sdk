// Wrangler-specific constants for the auth layer, extracted so the OAuth-flow
// factory (`./index.ts`), the profile store (`./profile-store.ts`), and the
// keyring-preference logic (`./keyring-preference.ts`) can share them without
// importing each other (which would introduce an import cycle through
// `./index.ts`).

/**
 * Keyring service identifier passed to `createCredentialStorageContext` and to
 * the opt-out scrub in wrangler's `commands.ts`. Exported (re-exported from
 * `./index.ts`) so every site stays in sync — this becomes the `-s` arg to
 * macOS `security`, the `service` attribute for Linux `secret-tool`, and the
 * `service` arg to `@napi-rs/keyring`'s `Entry` on Windows.
 */
export const WRANGLER_KEYRING_SERVICE_NAME = "wrangler";

/** CLI name used for keyring install-dir scoping and user-facing messaging. */
export const WRANGLER_CLI_NAME = "wrangler";

/** The `redirect_uri` registered on Wrangler's OAuth app. */
export const OAUTH_CALLBACK_URL = "http://localhost:8976/oauth/callback";

/**
 * Wrangler's branded OAuth consent pages, shown to the user after they grant or
 * deny consent to Wrangler's OAuth app.
 */
export const WRANGLER_CONSENT_PAGES = {
	granted: {
		url: "https://welcome.developers.workers.dev/wrangler-oauth-consent-granted",
	},
	denied: {
		url: "https://welcome.developers.workers.dev/wrangler-oauth-consent-denied",
		error:
			"Error: Consent denied. You must grant consent to Wrangler in order to login.\n" +
			"If you don't want to do this consider passing an API token via the `CLOUDFLARE_API_TOKEN` environment variable",
	},
};
