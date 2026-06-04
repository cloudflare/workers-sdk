import type {
	generateAuthUrl as defaultGenerateAuthUrl,
	OAUTH_CALLBACK_URL,
} from "./generate-auth-url";
import type { generateRandomState as defaultGenerateRandomState } from "./generate-random-state";

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
