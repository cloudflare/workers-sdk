// cf-specific constants for the auth layer. Several values are placeholders
// pending the real cf OAuth app registration — search for `TODO(cf)`.

/**
 * OS-keyring service identifier for the `cf` CLI. Distinct from wrangler's so
 * the two CLIs' credentials never collide in the OS keychain. Becomes the `-s`
 * arg to macOS `security`, the `service` attribute for Linux `secret-tool`, and
 * the `service` arg to `@napi-rs/keyring` on Windows.
 */
export const CF_KEYRING_SERVICE_NAME = "cloudflare";

/** CLI name used for keyring install-dir scoping and user-facing messaging. */
export const CF_CLI_NAME = "cf";

/**
 * The `redirect_uri` registered on cf's OAuth app; also the local callback URL.
 *
 * TODO(cf): replace with the real redirect URI registered on cf's OAuth app.
 */
export const CF_OAUTH_CALLBACK_URL = "http://localhost:8976/oauth/callback";

/**
 * cf's branded OAuth consent pages, shown after the user grants or denies
 * consent to cf's OAuth app.
 *
 * TODO(cf): replace with cf's real branded consent page URLs.
 */
export const CF_CONSENT_PAGES = {
	granted: {
		url: "https://welcome.developers.workers.dev/cf-oauth-consent-granted",
	},
	denied: {
		url: "https://welcome.developers.workers.dev/cf-oauth-consent-denied",
		error:
			"Error: Consent denied. You must grant consent to the Cloudflare CLI in order to login.\n" +
			"If you don't want to do this consider passing an API token via the `CLOUDFLARE_API_TOKEN` environment variable",
	},
};
