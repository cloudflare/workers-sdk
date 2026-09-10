import {
	getCloudflareComplianceRegion,
	UserError,
} from "@cloudflare/workers-utils";
import dedent from "ts-dedent";
import { fetch } from "undici";
import { getOauthToken } from "./callback-server";
import { getAPIToken, requireApiToken } from "./credentials";
import { getOauthTokenViaDeviceFlow } from "./device-flow";
import { getRevokeUrlFromEnv } from "./env-vars";
import { ErrorInvalidGrant } from "./errors";
import { generateAuthUrl as defaultGenerateAuthUrl } from "./generate-auth-url";
import { generateRandomState as defaultGenerateRandomState } from "./generate-random-state";
import { withRefreshLock } from "./refresh-lock";
import { readStoredAuthState, type OAuthFlowState } from "./state";
import { getOrCreateTemporaryPreviewAccount } from "./temporary";
import { exchangeRefreshTokenForAccessToken } from "./token-exchange";
import type { AuthConfigStorage } from "./config-file/auth";
import type { TemporaryPreviewAccount } from "./config-file/temporary";
import type { OAuthFlowContext } from "./context";
import type {
	ApiCredentials,
	ComplianceConfig,
} from "@cloudflare/workers-utils";

/**
 * Reason why {@link OAuthFlowAPI.loginOrRefreshIfRequired} could not
 * authenticate the user.
 */
export type LoginOrRefreshFailureReason =
	/** no stored credentials and the environment is non-interactive (CI, piped stdin, etc.) so a browser login cannot be started. */
	| "no-credentials-non-interactive"
	/** stored credentials and the interactive login attempt was unsuccessful (user cancelled, etc.). */
	| "no-credentials-login-failed"
	/** the stored token has expired, refresh failed, and the environment is non-interactive so a browser login cannot be started. */
	| "token-expired-non-interactive"
	/** the stored token has expired, refresh failed, and the interactive login attempt was unsuccessful. */
	| "token-expired-login-failed";

/**
 * Discriminated union returned by {@link OAuthFlowAPI.loginOrRefreshIfRequired}.
 *
 * When `loggedIn` is `true` the caller can proceed. When `false`, `reason`
 * describes why authentication failed so the caller can surface a
 * targeted error message.
 */
export type LoginOrRefreshResult =
	| { loggedIn: true }
	| { loggedIn: false; reason: LoginOrRefreshFailureReason };

/**
 * Options for an interactive OAuth login.
 */
export interface LoginProps {
	complianceConfig: ComplianceConfig;
	/**
	 * The OAuth scopes to request. The catalog of valid scope keys is
	 * consumer-defined; this package treats scopes as opaque strings.
	 */
	scopes: string[];
	/**
	 * Whether to open the authorize URL in a browser. Defaults to `true`.
	 * When `false` the URL is printed for the user to copy/paste.
	 */
	browser?: boolean;
	/** Host the local callback server listens on. Defaults to `localhost`. */
	callbackHost?: string;
	/** Port the local callback server listens on. Defaults to `8976`. */
	callbackPort?: number;
	/**
	 * Named auth profile to store the token under. When omitted, the default
	 * profile (`default.toml`) is used.
	 * Only for use by 'auth create', not exposed to the user
	 */
	profile?: string;
	/**
	 * When `true`, authenticate using the OAuth 2.0 Device Authorization Grant
	 * (RFC 8628) instead of the authorization-code-with-PKCE callback flow. The
	 * device flow does not start a local callback server and works in
	 * environments where the consumer's loopback callback URL
	 * ({@link OAuthFlowContext.redirectUri}) is unreachable from the user's
	 * browser (containers, remote SSH sessions, Codespaces). `callbackHost` and
	 * `callbackPort` are ignored when this is set.
	 */
	device?: boolean;
}

/**
 * Public surface returned by {@link createOAuthFlow}.
 */
export interface OAuthFlowAPI {
	/**
	 * Set the active auth profile for all subsequent storage lookups.
	 *
	 * Called once at top of command dispatch by the consumer after resolving the
	 * active profile. `"default"` if never called.
	 */
	setProfile(profile: string): void;

	getActiveProfile(): string;

	/**
	 * Open the authorize URL in the user's browser, wait for the callback to be
	 * hit on the local HTTP server, exchange the code for an access token, and
	 * persist the result to disk.
	 *
	 * Refuses to start when `ctx.hasEnvCredentials()` returns `true`.
	 * Refuses to start when the compliance region is `fedramp_high`.
	 *
	 * When `props.profile` is set, the token is stored under that profile
	 * instead of the active one. This is used by `auth create <name>`.
	 *
	 * @returns `true` on success, `false` when env credentials are present.
	 */
	login(props: LoginProps): Promise<boolean>;

	/**
	 * Revoke the stored refresh token at the Cloudflare OAuth endpoint and
	 * delete the on-disk auth config file.
	 *
	 * No-op when `ctx.hasEnvCredentials()` returns `true` (env credentials
	 * cannot be revoked).
	 *
	 * When `profile` is passed, operates on that profile instead of the
	 * active one. This is used by `auth delete <name>`.
	 */
	logout(profile?: string): Promise<void>;

	/**
	 * If the user has no stored OAuth token, attempt an interactive login.
	 * If they have one but it is expired, attempt a refresh; if refresh fails,
	 * fall back to an interactive login.
	 *
	 * Scopes are required in case an interactive login is triggered — the
	 * consumer's scope catalog lives outside this package.
	 *
	 * @returns `{ loggedIn: true }` when the user is authenticated (or env
	 * credentials are present). When authentication fails, returns
	 * `{ loggedIn: false, reason }` describing why — see
	 * {@link LoginOrRefreshFailureReason}.
	 */
	loginOrRefreshIfRequired(props: LoginProps): Promise<LoginOrRefreshResult>;

	/**
	 * Read the OAuth access token from local state, refreshing it first if
	 * needed. Returns `undefined` when there is no stored OAuth token or the
	 * refresh fails.
	 *
	 * This intentionally does NOT consult env credentials — callers that want
	 * env-or-OAuth resolution should check env first themselves.
	 */
	getOAuthTokenFromLocalState(): Promise<string | undefined>;

	/**
	 * Resolve API credentials, preferring an active temporary preview account
	 * (when one has been latched via {@link activateTemporaryAccount}) over the
	 * env / stored-OAuth resolution performed by the shared credential resolver.
	 *
	 * Returns `undefined` when no credentials are available.
	 */
	getAPIToken(): ApiCredentials | undefined;

	/**
	 * Like {@link getAPIToken}, but throws a `UserError` when no credentials are
	 * available.
	 */
	requireApiToken(): ApiCredentials;

	/**
	 * Return the scopes granted to the stored OAuth token for the active
	 * profile, or `undefined` when no OAuth token is stored.
	 */
	getScopes(): string[] | undefined;

	/**
	 * Establish whether `--temporary` is permitted for this invocation. Called
	 * once at command dispatch by the consumer. Also drops any temporary account
	 * latched by a previous dispatch, so that — when multiple commands share a
	 * process (e.g. in tests) — each invocation starts a fresh temporary session.
	 * No-op when the flow was created without a `temporary` context.
	 */
	setTemporaryAllowed(allowed: boolean): void;

	/**
	 * Whether `--temporary` is permitted for this invocation (see
	 * {@link setTemporaryAllowed}). Always `false` without a `temporary` context.
	 */
	isTemporaryAllowed(): boolean;

	/**
	 * The temporary preview account latched for this invocation, or `undefined`.
	 * Only set after {@link activateTemporaryAccount} has run.
	 */
	getActiveTemporaryAccount(): TemporaryPreviewAccount | undefined;

	/**
	 * The sole creator of the temporary-account latch: mint a fresh temporary
	 * preview account (or reuse a cached one), latch it for this invocation, and
	 * return it. Requires a `temporary` context.
	 */
	activateTemporaryAccount(): Promise<{
		account: TemporaryPreviewAccount;
		cached: boolean;
	}>;
}

/**
 * Build an instance of the OAuth flow bound to the given context.
 *
 * The returned object owns module-private state (the transient OAuth flow
 * state and the deprecated-v1 warning latch). In practice consumers create
 * exactly one instance per process.
 */
export function createOAuthFlow(ctx: OAuthFlowContext): OAuthFlowAPI {
	const oauthFlowState: OAuthFlowState = {};
	const generators = {
		generateAuthUrl: ctx.generateAuthUrl ?? defaultGenerateAuthUrl,
		generateRandomState: ctx.generateRandomState ?? defaultGenerateRandomState,
	};

	let activeProfile = "default";

	/**
	 * In-flight refresh promises keyed by storage path, used to deduplicate
	 * concurrent `refreshToken` calls within the same process. Without this,
	 * two parallel API requests that both see an expired token would each try
	 * to acquire the file lock — and because the lock is held by the same PID,
	 * the second caller would wait out the full retry budget (~30 s) before
	 * proceeding.
	 */
	const inflightRefreshes = new Map<string, Promise<boolean>>();

	function getStorage(profile?: string): AuthConfigStorage {
		return ctx.storageFactory(profile ?? activeProfile);
	}

	const getClientId = () =>
		typeof ctx.clientId === "function" ? ctx.clientId() : ctx.clientId;
	const consent = ctx.consent;

	let temporaryAllowed = false;
	let activeTemporaryAccount: TemporaryPreviewAccount | undefined;

	const redirectUrl = new URL(ctx.redirectUri);
	const defaultCallbackHost = redirectUrl.hostname;
	const defaultCallbackPort = Number(redirectUrl.port);

	async function login(props: LoginProps): Promise<boolean> {
		if (ctx.hasEnvCredentials()) {
			// Env credentials override any login details, so no point in allowing
			// the user to login.
			ctx.logger.error(
				"You are logged in with an API Token. Unset the CLOUDFLARE_API_TOKEN in the " +
					"environment to log in via OAuth."
			);
			return false;
		}

		const complianceRegion = getCloudflareComplianceRegion(
			props.complianceConfig
		);
		if (complianceRegion === "fedramp_high") {
			const configurationSource = props.complianceConfig?.compliance_region
				? "`compliance_region` configuration property"
				: "`CLOUDFLARE_API_ENVIRONMENT` environment variable";
			throw new UserError(
				dedent`
				OAuth login is not supported in the \`${complianceRegion}\` compliance region.
				Please use a Cloudflare API token (\`CLOUDFLARE_API_TOKEN\` environment variable) or remove the ${configurationSource}.
			`,
				{
					telemetryMessage: "user login unsupported compliance region",
				}
			);
		}

		let oauth;
		if (props.device) {
			ctx.logger.log(
				"Attempting to login via OAuth Device Authorization Grant..."
			);
			oauth = await getOauthTokenViaDeviceFlow(
				{
					browser: props.browser ?? true,
					scopes: props.scopes,
					clientId: getClientId(),
				},
				ctx
			);
		} else {
			ctx.logger.log("Attempting to login via OAuth...");

			oauth = await getOauthToken(
				{
					browser: props.browser ?? true,
					scopes: props.scopes,
					clientId: getClientId(),
					redirectUri: ctx.redirectUri,
					denied: consent.denied,
					granted: consent.granted,
					callbackHost: props.callbackHost ?? defaultCallbackHost,
					callbackPort: props.callbackPort ?? defaultCallbackPort,
				},
				oauthFlowState,
				ctx,
				generators
			);
		}

		getStorage(props.profile).write({
			oauth_token: oauth.token?.value ?? "",
			expiration_time: oauth.token?.expiry,
			refresh_token: oauth.refreshToken?.value,
			scopes: oauth.scopes,
		});

		ctx.logger.log(`Successfully logged in.`);

		clearTemporaryAccount();
		ctx.purgeOnLoginOrLogout?.();

		return true;
	}

	function isRefreshNeeded(profile?: string): boolean {
		if (ctx.hasEnvCredentials()) {
			return false;
		}
		const { accessToken } = readStoredAuthState({
			warningLogger: ctx.logger,
			storage: getStorage(profile),
		});
		return Boolean(accessToken && new Date() >= new Date(accessToken.expiry));
	}

	async function refreshToken(profile?: string): Promise<boolean> {
		const storage = getStorage(profile);
		const storagePath = storage.path();

		const existing = inflightRefreshes.get(storagePath);
		if (existing) {
			return existing;
		}

		const promise = doRefreshToken(storage);
		inflightRefreshes.set(storagePath, promise);
		try {
			return await promise;
		} finally {
			inflightRefreshes.delete(storagePath);
		}
	}

	/**
	 * Perform the actual token refresh, serialized behind an advisory file lock.
	 *
	 * Callers should go through {@link refreshToken} which deduplicates
	 * concurrent in-process calls.
	 *
	 * @param storage - The auth config storage to refresh against.
	 * @returns `true` if the refresh succeeded, `false` otherwise.
	 */
	async function doRefreshToken(storage: AuthConfigStorage): Promise<boolean> {
		const lockDir = storage.path() + ".refresh-lock";

		return withRefreshLock(lockDir, async () => {
			// After acquiring the lock, re-read the auth state — a sibling
			// process may have already completed the refresh while we waited.
			const postLockState = readStoredAuthState({
				warningLogger: ctx.logger,
				storage,
			});
			if (
				postLockState.accessToken &&
				new Date() < new Date(postLockState.accessToken.expiry)
			) {
				return true;
			}

			// Use the refresh token we just read so the same value is both sent
			// to the server and compared in the retry logic — avoids a TOCTOU
			// race where a sibling rotates the on-disk value between this read
			// and the exchange function's independent read.
			const sentRefreshToken = postLockState.refreshToken?.value;

			try {
				return await doExchange(storage, sentRefreshToken);
			} catch (e) {
				if (isInvalidGrantError(e)) {
					return handleInvalidGrant(storage, sentRefreshToken, e);
				}
				ctx.logger.warn(`Token refresh failed: ${describeError(e)}`);
				return false;
			}
		});
	}

	/**
	 * Execute the refresh-token exchange and persist the result.
	 *
	 * @param storage - The auth config storage to write to.
	 * @param refreshTokenValue - The refresh token value to send. Passing it
	 *   explicitly avoids a second disk read inside
	 *   `exchangeRefreshTokenForAccessToken` that could race with a sibling
	 *   process rotating the on-disk value.
	 * @returns `true` on success.
	 */
	async function doExchange(
		storage: AuthConfigStorage,
		refreshTokenValue?: string
	): Promise<boolean> {
		const {
			token: { value: oauth_token, expiry: expiration_time } = {
				value: "",
				expiry: "",
			},
			refreshToken: { value: refresh_token } = {},
			scopes,
		} = await exchangeRefreshTokenForAccessToken(
			ctx.logger,
			ctx.isNonInteractiveOrCI,
			getClientId(),
			storage,
			refreshTokenValue
		);
		storage.write({
			oauth_token,
			expiration_time,
			refresh_token,
			scopes,
		});
		return true;
	}

	/**
	 * Handle an `invalid_grant` error from the token endpoint by checking
	 * whether a sibling process has already rotated the refresh token on
	 * disk. If so, either the sibling's refresh already produced a fresh
	 * access token (skip) or the on-disk refresh token differs and we can
	 * retry the exchange once with the new value.
	 *
	 * @param storage - The auth config storage.
	 * @param sentRefreshToken - The refresh token value that was sent in the
	 *   failed exchange, so we can detect on-disk rotation.
	 * @param originalError - The original error for logging.
	 * @returns `true` if the refresh ultimately succeeded, `false` otherwise.
	 */
	async function handleInvalidGrant(
		storage: AuthConfigStorage,
		sentRefreshToken: string | undefined,
		originalError: unknown
	): Promise<boolean> {
		const freshState = readStoredAuthState({
			warningLogger: ctx.logger,
			storage,
		});

		if (
			freshState.accessToken &&
			new Date() < new Date(freshState.accessToken.expiry)
		) {
			return true;
		}

		if (
			freshState.refreshToken?.value &&
			freshState.refreshToken.value !== sentRefreshToken
		) {
			try {
				return await doExchange(storage, freshState.refreshToken.value);
			} catch (retryErr) {
				ctx.logger.warn(
					`Token refresh retry failed: ${describeError(retryErr)}`
				);
				return false;
			}
		}

		ctx.logger.warn(`Token refresh failed: ${describeError(originalError)}`);
		return false;
	}

	/**
	 * Extract a human-readable message from an unknown thrown value.
	 *
	 * `exchangeRefreshTokenForAccessToken` can throw plain objects (the raw
	 * parsed JSON body for >= 400 responses, e.g. `{ error: "invalid_grant",
	 * error_description: "..." }`), `Error` instances, or strings. Using
	 * `String()` on a plain object produces the unhelpful `"[object Object]"`,
	 * so this helper prefers the OAuth `error` / `error_description` fields
	 * when available.
	 *
	 * @param e - The caught error value.
	 * @returns A readable string suitable for a user-facing warning.
	 */
	function describeError(e: unknown): string {
		if (e instanceof Error) {
			return e.message;
		}
		if (typeof e === "string") {
			return e;
		}
		if (typeof e === "object" && e !== null) {
			const obj = e as Record<string, unknown>;
			if (typeof obj.error === "string") {
				return obj.error_description
					? `${obj.error}: ${obj.error_description}`
					: obj.error;
			}
			return JSON.stringify(e);
		}
		return String(e);
	}

	/**
	 * Detect an `invalid_grant` error regardless of its shape.
	 *
	 * `exchangeRefreshTokenForAccessToken` can throw either:
	 * - An `ErrorInvalidGrant` instance (structured error from `toErrorClass`)
	 * - A plain object `{ error: "invalid_grant" }` (raw JSON from a >= 400 response)
	 *
	 * @param e - The caught error value.
	 * @returns `true` if the error represents an `invalid_grant` OAuth error.
	 */
	function isInvalidGrantError(e: unknown): boolean {
		if (e instanceof ErrorInvalidGrant) {
			return true;
		}
		if (
			typeof e === "object" &&
			e !== null &&
			"error" in e &&
			(e as { error: unknown }).error === "invalid_grant"
		) {
			return true;
		}
		return false;
	}

	async function loginOrRefreshIfRequired(
		props: LoginProps
	): Promise<LoginOrRefreshResult> {
		// If env credentials are present, the consumer's credential resolver
		// will use those rather than the stored OAuth token, so we don't need
		// to refresh or log in.
		if (ctx.hasEnvCredentials()) {
			return { loggedIn: true };
		}
		// TODO: ask permission before opening browser
		const stored = readStoredAuthState({
			warningLogger: ctx.logger,
			storage: getStorage(props.profile),
		});
		// eslint-disable-next-line @typescript-eslint/no-deprecated -- deprecatedApiToken is a deprecated property, but still needs to be supported for backwards compatibility so we need to handle appropriately here */
		if (!stored.accessToken && !stored.deprecatedApiToken) {
			// Not logged in.
			// If we are not interactive, we cannot ask the user to login
			if (ctx.isNonInteractiveOrCI()) {
				return {
					loggedIn: false,
					reason: "no-credentials-non-interactive",
				};
			}
			if (await login(props)) {
				return { loggedIn: true };
			}
			return { loggedIn: false, reason: "no-credentials-login-failed" };
		} else if (isRefreshNeeded(props.profile)) {
			// We're logged in, but the refresh token seems to have expired,
			// so let's try to refresh it
			const didRefresh = await refreshToken(props.profile);
			if (didRefresh) {
				// The token was refreshed, so we're done here
				return { loggedIn: true };
			}
			// If the refresh token isn't valid, then we ask the user to login again
			if (ctx.isNonInteractiveOrCI()) {
				return {
					loggedIn: false,
					reason: "token-expired-non-interactive",
				};
			}
			if (await login(props)) {
				return { loggedIn: true };
			}
			return { loggedIn: false, reason: "token-expired-login-failed" };
		} else {
			return { loggedIn: true };
		}
	}

	async function logout(profile?: string): Promise<void> {
		const clearedTemporary = clearTemporaryAccount();

		if (ctx.hasEnvCredentials()) {
			// Env credentials override any login details, so we cannot log out.
			ctx.logger.log(
				"You are logged in with an API Token. Unset the CLOUDFLARE_API_TOKEN in the " +
					"environment to log out."
			);
			return;
		}

		const storedRefreshToken = readStoredAuthState({
			warningLogger: ctx.logger,
			storage: getStorage(profile),
		}).refreshToken;
		if (!storedRefreshToken) {
			ctx.logger.log(
				clearedTemporary
					? "Cleared temporary preview account."
					: "Not logged in, exiting..."
			);
			return;
		}

		const body =
			`client_id=${encodeURIComponent(getClientId())}&` +
			`token_type_hint=refresh_token&` +
			`token=${encodeURIComponent(storedRefreshToken.value || "")}`;

		const response = await fetch(getRevokeUrlFromEnv(), {
			method: "POST",
			body,
			headers: {
				"Content-Type": "application/x-www-form-urlencoded",
			},
		});
		await response.text(); // blank text? would be nice if it was something meaningful
		getStorage(profile).clear();
		ctx.logger.log(`Successfully logged out.`);
		ctx.purgeOnLoginOrLogout?.();
	}

	async function getOAuthTokenFromLocalState(): Promise<string | undefined> {
		// Check if we have an OAuth token
		let stored = readStoredAuthState({
			warningLogger: ctx.logger,
			storage: getStorage(),
		});
		if (!stored.accessToken) {
			return undefined;
		}

		// If the token is expired, try to refresh it.
		// Note: we deliberately check the expiry directly rather than going through
		// `isRefreshNeeded()`, because this function is called from contexts that
		// already know they want the OAuth token (not env credentials), and we
		// don't want the env-credentials short-circuit to skip the refresh.
		const expired =
			stored.accessToken && new Date() >= new Date(stored.accessToken.expiry);
		if (expired) {
			const didRefresh = await refreshToken();
			if (!didRefresh) {
				return undefined;
			}
			// Re-read after the refresh has persisted the new token to disk.
			stored = readStoredAuthState({
				warningLogger: ctx.logger,
				storage: getStorage(),
			});
		}

		return stored.accessToken?.value;
	}

	function getAPITokenInternal(): ApiCredentials | undefined {
		if (activeTemporaryAccount) {
			return { apiToken: activeTemporaryAccount.account.apiToken };
		}

		return getAPIToken({
			storage: getStorage(),
			warningLogger: ctx.logger,
			allowGlobalAuthKey: ctx.allowGlobalAuthKey,
		});
	}

	function requireApiTokenInternal(): ApiCredentials {
		if (activeTemporaryAccount) {
			return { apiToken: activeTemporaryAccount.account.apiToken };
		}

		return requireApiToken({
			storage: getStorage(),
			warningLogger: ctx.logger,
			allowGlobalAuthKey: ctx.allowGlobalAuthKey,
		});
	}

	function setTemporaryAllowed(allowed: boolean): void {
		temporaryAllowed = allowed && ctx.temporary !== undefined;
		activeTemporaryAccount = undefined;
	}

	function isTemporaryAllowed(): boolean {
		return temporaryAllowed;
	}

	function getActiveTemporaryAccount(): TemporaryPreviewAccount | undefined {
		return activeTemporaryAccount;
	}

	async function activateTemporaryAccount(): Promise<{
		account: TemporaryPreviewAccount;
		cached: boolean;
	}> {
		if (!ctx.temporary) {
			throw new UserError(
				"Temporary preview accounts are not supported by this CLI.",
				{ telemetryMessage: "user temporary account unsupported" }
			);
		}

		const result = await getOrCreateTemporaryPreviewAccount({
			...ctx.temporary,
			logger: ctx.logger,
		});
		activeTemporaryAccount = result.account;
		return result;
	}

	function clearTemporaryAccount(): boolean {
		activeTemporaryAccount = undefined;
		return ctx.temporary?.storage.clear() ?? false;
	}

	function setProfile(profile: string): void {
		activeProfile = profile;
	}

	function getActiveProfile(): string {
		return activeProfile;
	}

	function getScopes(): string[] | undefined {
		return readStoredAuthState({
			warningLogger: ctx.logger,
			storage: getStorage(),
		}).scopes;
	}

	return {
		setProfile,
		getActiveProfile,
		login,
		logout,
		loginOrRefreshIfRequired,
		getOAuthTokenFromLocalState,
		getAPIToken: getAPITokenInternal,
		requireApiToken: requireApiTokenInternal,
		getScopes,
		setTemporaryAllowed,
		isTemporaryAllowed,
		getActiveTemporaryAccount,
		activateTemporaryAccount,
	};
}
