import type { AuthConfigStorage } from "./config-file/auth";
import type { TemporaryAccountStorage } from "./config-file/temporary";
import type { generateAuthUrl as defaultGenerateAuthUrl } from "./generate-auth-url";
import type { generateRandomState as defaultGenerateRandomState } from "./generate-random-state";

/**
 * The dependencies the OAuth flow needs to mint/reuse a short-lived "temporary
 * preview account"
 */
export interface OAuthFlowTemporaryContext {
	/** Persistence backend for the cached temporary preview account. */
	storage: TemporaryAccountStorage;
	/**
	 * Hook to customise the terms-acceptance interactive prompt
	 *  - question: the question to ask a user in interactive mode.
	 *    return answer === "yes" (must be the literal string)
	 *  - notice: the notice to print on stderr if in non-interactive mode
	 *    always return true
	 */
	prompt: (question: string, notice: string) => Promise<boolean>;
}

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
	 * server. Consumer-specific (each CLI registers its own OAuth app), so it is
	 * required. Pass a function to resolve it lazily — e.g. so an env-var read at
	 * call time can switch between production and staging apps.
	 */
	clientId: string | (() => string);

	/**
	 * The branded consent pages the provider redirects to after the user grants
	 * or denies consent.
	 */
	consent: OAuthConsentPages;

	/**
	 * The `redirect_uri` registered on the consumer's OAuth app
	 */
	redirectUri: string;

	/**
	 * Persistence backend for the stored auth config.
	 */
	storage: AuthConfigStorage;

	/**
	 * Whether the flow's credential resolvers (`getAPIToken` / `requireApiToken`)
	 * should honour the global API key + email pair in addition to scoped API
	 * tokens.
	 */
	allowGlobalAuthKey: boolean;

	/**
	 * Dependencies for minting/reusing a temporary preview account.
	 */
	temporary: OAuthFlowTemporaryContext | undefined;

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
