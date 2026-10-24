import {
	DevelopmentOidcRequestPool,
	DevelopmentOidcRequestTimeoutError,
	DevelopmentOidcTokenRequests,
	snapshotDevelopmentOidcIdentity,
	validateDevelopmentOidcAudience,
} from "miniflare";
import { DevelopmentOidcApiError } from "./development-oidc-errors";
import type { CfAccount } from "@cloudflare/workers-utils";
import type { DevelopmentOidcIdentity, DevelopmentOidcToken } from "miniflare";

/** Session metadata returned by the authorized Cloudflare development API. */
export interface DevelopmentOidcBindingRequest {
	binding: string;
	identity_id: string;
	audience?: string;
	allowed_audiences?: readonly string[];
}

export interface DevelopmentOidcSession {
	binding: string;
	allowedAudiences: readonly string[];
	identity: DevelopmentOidcIdentity;
	defaultAudience: string;
	/** Server session expiry in Unix seconds. */
	expiresAt: number;
}

/**
 * Trusted host transport for development issuance. Both operations must use
 * human OAuth and server-side Worker authorization. No caller-supplied subject
 * or identity may become signing authority. Bind the session to the requested
 * Worker, validate the full token profile and audience rules, cap HTTP response
 * bodies before decoding them, and return errors that contain no credentials.
 * Honor cancellation and release response bodies/connections on every path.
 */
export interface DevelopmentOidcTransport {
	createSession(
		auth: CfAccount,
		workerName: string,
		binding: DevelopmentOidcBindingRequest,
		signal: AbortSignal
	): Promise<DevelopmentOidcSession>;
	issueToken(
		auth: CfAccount,
		session: DevelopmentOidcSession,
		audience: string,
		fresh: boolean,
		signal: AbortSignal
	): Promise<DevelopmentOidcToken>;
}

type OAuthAccount = CfAccount & { apiToken: { apiToken: string } };

interface SessionState {
	accountId: string;
	oauthToken: string;
	controller: AbortController;
	session: Promise<DevelopmentOidcSession>;
	monotonicExpiry?: number;
	expiresAt?: number;
}

/**
 * Host-side session lifecycle shared by Wrangler, Vite, and opted-in tests.
 * Construct one per linked Worker, retain it across code reloads, and dispose
 * it when the dev server stops or the configured Worker changes. Credentials
 * are read on every getter, so login/logout does not require a restart.
 */
export class DevelopmentOidcProvider {
	#workerName: string;
	#binding: Readonly<DevelopmentOidcBindingRequest>;
	#getAuth: (signal: AbortSignal) => Promise<CfAccount>;
	#transport: DevelopmentOidcTransport;
	#tokens = new DevelopmentOidcTokenRequests();
	#requests = new DevelopmentOidcRequestPool();
	#shutdown = new AbortController();
	#state?: SessionState;
	#authPromise?: Promise<OAuthAccount>;
	#retryAfter?: {
		accountId: string;
		oauthToken: string;
		deadline: number;
		error: DevelopmentOidcApiError;
	};
	#callers = 0;

	constructor(
		workerName: string,
		getAuth: (signal: AbortSignal) => Promise<CfAccount>,
		transport: DevelopmentOidcTransport,
		binding: DevelopmentOidcBindingRequest
	) {
		this.#workerName = workerName;
		this.#binding = Object.freeze({
			...binding,
			allowed_audiences:
				binding.allowed_audiences &&
				Object.freeze([...binding.allowed_audiences]),
		});
		this.#getAuth = getAuth;
		// Snapshot adapter methods; keep them in native private fields with credentials.
		this.#transport = Object.freeze({
			createSession: transport.createSession.bind(transport),
			issueToken: transport.issueToken.bind(transport),
		});
	}

	/**
	 * Get the linked Worker's development token, including for local DOs.
	 *
	 * @param options Audience override, preserved exactly as supplied.
	 * @returns A server-signed token with at least 60 seconds remaining.
	 */
	async getToken(
		options: { audience?: string; fresh?: boolean } = {}
	): Promise<string> {
		this.#checkActive();
		if (
			typeof this.#workerName !== "string" ||
			this.#workerName.length > 63 ||
			!this.#workerName.trim()
		) {
			throw new Error(
				"Development OIDC requires an existing Worker name in your project configuration."
			);
		}
		if (options === null || typeof options !== "object") {
			throw new Error("Development OIDC requires an options object.");
		}
		const keys = Reflect.ownKeys(options);
		if (keys.some((key) => key !== "audience" && key !== "fresh")) {
			throw new Error(
				"Development OIDC accepts only audience and boolean fresh options."
			);
		}
		// Snapshot before the first await: callers may retain and mutate options.
		const fresh = keys.includes("fresh") ? options.fresh : false;
		if (typeof fresh !== "boolean") {
			throw new Error(
				"Development OIDC accepts only audience and boolean fresh options."
			);
		}
		const requestedAudience = keys.includes("audience")
			? options.audience
			: undefined;
		if (requestedAudience !== undefined) {
			validateDevelopmentOidcAudience(requestedAudience);
		}
		if (this.#callers >= 128) {
			throw new Error("Too many concurrent development OIDC requests.");
		}
		this.#callers++;
		try {
			const auth = await this.#readAuth();
			this.#checkActive();
			let state = this.#state;
			if (
				state?.accountId !== auth.accountId ||
				state.oauthToken !== auth.apiToken.apiToken ||
				(state.expiresAt !== undefined &&
					(state.expiresAt * 1000 < Date.now() + 300000 ||
						(state.monotonicExpiry ?? 0) < performance.now() + 300000))
			) {
				this.#checkRetryAfter(auth);
				this.#invalidate();
				const controller = new AbortController();
				state = {
					accountId: auth.accountId,
					oauthToken: auth.apiToken.apiToken,
					controller,
					session: this.#requests.run(async (signal) => {
						const response = await this.#transport.createSession(
							auth,
							this.#workerName,
							this.#binding,
							signal
						);
						signal.throwIfAborted();
						const identity = snapshotDevelopmentOidcIdentity(
							response?.identity
						);
						const defaultAudience = response?.defaultAudience;
						validateDevelopmentOidcAudience(defaultAudience);
						if (
							identity.accountId !== auth.accountId ||
							identity.identityId !== this.#binding.identity_id ||
							response.binding !== this.#binding.binding
						) {
							throw new Error(
								"Development OIDC returned a session for a different account or binding."
							);
						}
						if (
							!Array.isArray(response.allowedAudiences) ||
							response.allowedAudiences.length > 64 ||
							new Set(response.allowedAudiences).size !==
								response.allowedAudiences.length ||
							!response.allowedAudiences.includes(defaultAudience)
						) {
							throw new Error(
								"Development OIDC returned an invalid audience policy. Retry the getter."
							);
						}
						for (const audience of response.allowedAudiences) {
							validateDevelopmentOidcAudience(audience);
						}
						if (this.#binding.audience !== undefined) {
							const requested = this.#binding.allowed_audiences ?? [
								this.#binding.audience,
							];
							if (
								defaultAudience !== this.#binding.audience ||
								requested.length !== response.allowedAudiences.length ||
								requested.some(
									(audience) => !response.allowedAudiences.includes(audience)
								)
							) {
								throw new Error(
									"Development OIDC binding does not match its approved audience policy."
								);
							}
						}
						const expiresAt = response?.expiresAt;
						const remaining = expiresAt * 1000 - Date.now();
						if (
							!Number.isSafeInteger(expiresAt) ||
							remaining < 300000 ||
							remaining > 28800000
						) {
							throw new Error(
								"Development OIDC returned an invalid session lifetime."
							);
						}
						if (this.#state?.controller === controller) {
							this.#state.expiresAt = expiresAt;
							this.#state.monotonicExpiry = performance.now() + remaining;
						}
						return Object.freeze({
							identity,
							defaultAudience,
							expiresAt,
							binding: response.binding,
							allowedAudiences: Object.freeze([...response.allowedAudiences]),
						});
					}, controller.signal),
				};
				this.#state = state;
			}
			let established = false;
			try {
				const session = await state.session;
				this.#checkCurrent(state);
				established = true;
				const audience = requestedAudience ?? session.defaultAudience;
				const token = await this.#tokens.getToken(
					session.identity,
					audience,
					(signal) => {
						this.#checkRetryAfter(auth);
						return this.#transport.issueToken(
							auth,
							session,
							audience,
							fresh,
							AbortSignal.any([signal, state.controller.signal])
						);
					}
				);
				// Recheck the session after the issuance request completes.
				this.#checkCurrent(state);
				return token;
			} catch (error) {
				if (this.#state === state) {
					const temporary =
						error instanceof DevelopmentOidcRequestTimeoutError ||
						(error instanceof DevelopmentOidcApiError &&
							(error.kind === "unavailable" || error.kind === "rate_limited"));
					// Failed creation must release its rejected promise. Only known
					// temporary issuance failures can retain an established session.
					if (!established || !temporary) {
						this.#invalidate();
					}
					if (
						temporary &&
						error instanceof DevelopmentOidcApiError &&
						error.retryAfterMs !== undefined &&
						this.#retryAfter?.error !== error
					) {
						this.#retryAfter = {
							accountId: auth.accountId,
							oauthToken: auth.apiToken.apiToken,
							deadline: performance.now() + error.retryAfterMs,
							error,
						};
					}
				}
				throw error;
			}
		} finally {
			this.#callers--;
		}
	}

	#readAuth(): Promise<OAuthAccount> {
		if (this.#authPromise) {
			return this.#authPromise;
		}
		const pending = this.#requests.run(async (signal) => {
			const response = await this.#getAuth(signal);
			signal.throwIfAborted();
			const accountId = response?.accountId;
			const credentials = response?.apiToken;
			const token =
				credentials &&
				typeof credentials === "object" &&
				"apiToken" in credentials
					? credentials.apiToken
					: undefined;
			if (
				typeof accountId !== "string" ||
				accountId.length === 0 ||
				accountId.length > 4096 ||
				/[^A-Za-z0-9_-]/.test(accountId) ||
				typeof token !== "string" ||
				token.length === 0 ||
				token.length > 65_536 ||
				// RFC 6750 bearer syntax; trim also rejects a final line terminator,
				// which JavaScript's `$` anchor otherwise permits.
				token.trim() !== token ||
				!/^[A-Za-z0-9._~+/-]+=*$/.test(token)
			) {
				throw new Error(
					"Development OIDC requires human OAuth credentials and a valid account."
				);
			}
			return Object.freeze({
				accountId,
				apiToken: Object.freeze({ apiToken: token }),
			});
		}, this.#shutdown.signal);
		this.#authPromise = pending;
		// One handler per auth generation invalidates before a newer read can start.
		void pending.then(
			() => {
				if (this.#authPromise === pending) {
					this.#authPromise = undefined;
				}
			},
			() => {
				if (this.#authPromise === pending) {
					this.#authPromise = undefined;
					this.#invalidate();
				}
			}
		);
		return pending;
	}

	/** Stop the provider and cancel outstanding network requests on shutdown. */
	dispose(): void {
		this.#shutdown.abort(
			new Error("The development OIDC provider has been disposed.")
		);
		this.#invalidate();
		this.#tokens.dispose();
	}

	#invalidate(): void {
		const state = this.#state;
		this.#state = undefined;
		this.#retryAfter = undefined;
		this.#tokens.clear();
		state?.controller.abort(
			new Error(
				"Development OIDC credentials changed during issuance. Retry the getter."
			)
		);
	}

	#checkRetryAfter(auth: OAuthAccount): void {
		const retry = this.#retryAfter;
		if (
			retry?.accountId === auth.accountId &&
			retry.oauthToken === auth.apiToken.apiToken &&
			performance.now() < retry.deadline
		) {
			throw retry.error;
		}
	}

	#checkCurrent(state: SessionState): void {
		this.#checkActive();
		state.controller.signal.throwIfAborted();
		if (this.#state !== state) {
			throw new Error(
				"Development OIDC credentials changed during issuance. Retry the getter."
			);
		}
	}

	#checkActive(): void {
		this.#shutdown.signal.throwIfAborted();
	}
}
