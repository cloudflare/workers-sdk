import type { AuthConfigStorage } from "./auth-config-file";
import type {
	generateAuthUrl as defaultGenerateAuthUrl,
	OAUTH_CALLBACK_URL,
} from "./generate-auth-url";
import type { generateRandomState as defaultGenerateRandomState } from "./generate-random-state";

/**
 * The branded OAuth consent pages the provider redirects the browser to after
 * the user grants or denies consent.
 */
export interface OAuthConsentPages {
	/** Redirect target shown after the user grants consent. */
	granted: { url: string };
	/** Redirect target shown after the user denies consent, plus the error
	 * surfaced to the terminal. */
	denied: { url: string; error: string };
}

/**
 * Where the local OAuth callback server listens and which `redirect_uri` is
 * registered on the OAuth app.
 */
export interface OAuthCallbackConfig {
	/** Host the local callback server listens on. Defaults to `localhost`. */
	host?: string;
	/** Port the local callback server listens on. Defaults to `8976`. */
	port?: number;
	/**
	 * The `redirect_uri` registered on the OAuth app. Defaults to
	 * `http://localhost:8976/oauth/callback`. Must match a redirect URI the
	 * `clientId`'s OAuth app is registered for.
	 */
	redirectUri?: string;
}

/**
 * Subset of the wrangler `logger` singleton used by the OAuth flow.
 * Consumers pass in an implementation that maps to their own logging surface.
 */
export interface OAuthFlowLogger {
	debug(...args: unknown[]): void;
	info(...args: unknown[]): void;
	log(...args: unknown[]): void;
	warn(...args: unknown[]): void;
	error(...args: unknown[]): void;
}

/**
 * Dependency-injection surface for {@link createOAuthFlow}.
 *
 * The OAuth flow only talks to OAuth endpoints (`/oauth2/auth`, `/oauth2/token`,
 * `/oauth2/revoke`) using `undici`'s `fetch` directly — there is no Cloudflare
 * API client wired into this context.
 */
export interface OAuthFlowContext {
	logger: OAuthFlowLogger;

	/**
	 * Whether the process should not prompt the user. The OAuth flow uses this to
	 * decide whether to short-circuit interactive login attempts.
	 */
	isNonInteractiveOrCI: () => boolean;

	/**
	 * Open the given URL in the user's default browser. Called during the
	 * interactive OAuth login flow with the authorize URL.
	 */
	openInBrowser: (url: string) => Promise<void>;

	/**
	 * Whether environment-based credentials are present. When `true`, the OAuth
	 * flow short-circuits because the env credentials take priority over stored
	 * OAuth tokens:
	 *   - `login` refuses to start
	 *   - `logout` is a no-op (it cannot revoke env credentials)
	 *   - the refresh check returns `false` so an expired stored OAuth token does
	 *     not trigger a needless refresh attempt
	 */
	hasEnvCredentials: () => boolean;

	/**
	 * Called after a successful `login` or `logout` so the consumer can invalidate
	 * any caches that depend on the active token (e.g. wrangler's selected-account
	 * cache).
	 */
	purgeOnLoginOrLogout?: () => void;

	/**
	 * The OAuth client ID identifying the consuming CLI to the Cloudflare OAuth
	 * server. Defaults to the value resolved from the environment
	 * (`WRANGLER_CLIENT_ID`, falling back to Wrangler's well-known client ID).
	 * Provide this to authenticate as a different OAuth app.
	 */
	clientId?: string;

	/**
	 * The branded consent pages the provider redirects to after the user grants
	 * or denies consent. Defaults to Wrangler's consent pages.
	 */
	consent?: OAuthConsentPages;

	/**
	 * Local callback server host/port and the registered `redirect_uri`.
	 * Defaults to `localhost:8976` and `http://localhost:8976/oauth/callback`.
	 * `LoginProps.callbackHost`/`callbackPort` override the host/port per call.
	 */
	callback?: OAuthCallbackConfig;

	/**
	 * Persistence backend for the stored auth config. Defaults to a TOML file
	 * under the global Wrangler config directory. Provide this to store tokens
	 * elsewhere or in a different format (e.g. JSONC under another CLI's config
	 * directory).
	 */
	storage?: AuthConfigStorage;

	/**
	 * Override the OAuth authorize URL generator. Used by tests to produce a
	 * deterministic URL for snapshot testing. Defaults to the standard
	 * implementation.
	 */
	generateAuthUrl?: typeof defaultGenerateAuthUrl;

	/**
	 * Override the random state generator. Used by tests to produce a
	 * deterministic state value for snapshot testing. Defaults to the standard
	 * implementation.
	 */
	generateRandomState?: typeof defaultGenerateRandomState;
}

export type { OAUTH_CALLBACK_URL };
