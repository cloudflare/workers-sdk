import { DevelopmentOidcTokenCache } from "miniflare";
import type { CfAccount } from "@cloudflare/workers-utils";
import type { DevelopmentOidcIdentity, DevelopmentOidcToken } from "miniflare";

/** Session metadata returned by the authorized Cloudflare development API. */
export interface DevelopmentOidcSession {
	identity: DevelopmentOidcIdentity;
	defaultAudience: string;
}

/**
 * Trusted host transport for development issuance. Both operations must use
 * human OAuth and server-side Worker authorization. No caller-supplied subject
 * or identity may become signing authority.
 */
export interface DevelopmentOidcTransport {
	createSession(
		auth: CfAccount,
		workerName: string,
		signal: AbortSignal
	): Promise<DevelopmentOidcSession>;
	issueToken(
		auth: CfAccount,
		session: DevelopmentOidcSession,
		audience: string,
		signal: AbortSignal
	): Promise<DevelopmentOidcToken>;
}

interface SessionState {
	accountId: string;
	oauthToken: string;
	controller: AbortController;
	session: Promise<DevelopmentOidcSession>;
}

/**
 * Host-side session lifecycle shared by Wrangler, Vite, and opted-in tests.
 * Construct one per linked Worker, retain it across code reloads, and dispose
 * it when the dev server stops or the configured Worker changes. Credentials
 * are read on every getter, so login/logout does not require a restart.
 */
export class DevelopmentOidcProvider {
	#cache = new DevelopmentOidcTokenCache();
	#state?: SessionState;
	#authPromise?: Promise<CfAccount>;
	#disposed = false;

	constructor(
		private readonly workerName: string,
		private readonly getAuth: () => Promise<CfAccount>,
		private readonly transport: DevelopmentOidcTransport
	) {}

	/**
	 * Get the linked Worker's development token, including for local DOs.
	 *
	 * @param options Audience override, preserved exactly as supplied.
	 * @returns A server-signed token with at least 60 seconds remaining.
	 */
	async getToken(options: { audience?: string } = {}): Promise<string> {
		this.#checkActive();
		if (!this.workerName) {
			throw new Error(
				"Development OIDC requires an existing Worker name in your project configuration."
			);
		}
		// The runtime also checks options. Retain the host-side restriction so
		// neither an adapter nor a test mock can turn a local DO into a cloud DO.
		if ("subject" in options) {
			throw new Error(
				"Local Durable Objects use the Worker's development identity. Explicit object and namespace subjects require a cloud Preview."
			);
		}
		let auth: CfAccount;
		try {
			this.#authPromise ??= Promise.resolve().then(() => this.getAuth());
			const pending = this.#authPromise;
			try {
				auth = await pending;
			} finally {
				if (this.#authPromise === pending) {
					this.#authPromise = undefined;
				}
			}
		} catch (error) {
			this.#invalidate();
			throw error;
		}
		this.#checkActive();
		if (!("apiToken" in auth.apiToken) || !auth.apiToken.apiToken) {
			this.#invalidate();
			throw new Error("Development OIDC requires human OAuth credentials.");
		}
		let state = this.#state;
		if (
			state?.accountId !== auth.accountId ||
			state.oauthToken !== auth.apiToken.apiToken
		) {
			this.#invalidate();
			const controller = new AbortController();
			state = {
				accountId: auth.accountId,
				oauthToken: auth.apiToken.apiToken,
				controller,
				session: Promise.resolve().then(() =>
					this.transport.createSession(auth, this.workerName, controller.signal)
				),
			};
			this.#state = state;
		}
		try {
			const session = await state.session;
			this.#checkActive();
			if (state.controller.signal.aborted) {
				throw new Error(
					"Development OIDC credentials changed during issuance. Retry the getter."
				);
			}
			if (session.identity.accountId !== auth.accountId) {
				throw new Error(
					"Development OIDC returned a session for a different account."
				);
			}
			const audience = options.audience ?? session.defaultAudience;
			return await this.#cache.getToken(session.identity, audience, (signal) =>
				this.transport.issueToken(
					auth,
					session,
					audience,
					AbortSignal.any([signal, state.controller.signal])
				)
			);
		} catch (error) {
			if (this.#state === state) {
				this.#invalidate();
			}
			throw error;
		}
	}

	/** Stop the provider and cancel outstanding network requests on shutdown. */
	dispose(): void {
		this.#disposed = true;
		this.#invalidate();
		this.#cache.dispose();
	}

	#invalidate(): void {
		const state = this.#state;
		this.#state = undefined;
		this.#cache.clear();
		state?.controller.abort();
	}

	#checkActive(): void {
		if (this.#disposed) {
			throw new Error("The development OIDC provider has been disposed.");
		}
	}
}
