/** The server-authorized identity and policy that own a development token. */
export interface DevelopmentOidcIdentity {
	accountId: string;
	workerId: string;
	userId: string;
	developmentSessionId: string;
	policy: string;
}

/** A token returned by the trusted development issuance transport. */
export interface DevelopmentOidcToken {
	token: string;
	/** JWT expiry, in seconds since the Unix epoch. */
	expiresAt: number;
}

/** Host-side issuance callback. Credentials must stay outside Worker code. */
export type DevelopmentOidcTokenIssuer = (
	signal: AbortSignal
) => Promise<DevelopmentOidcToken>;

const MINIMUM_LIFETIME_MS = 60_000;
const MAXIMUM_LIFETIME_MS = 300_000;
const MAXIMUM_ENTRIES = 128;

interface Entry {
	controller: AbortController;
	result: Promise<DevelopmentOidcToken>;
	token?: DevelopmentOidcToken;
	monotonicExpiry?: number;
}

/**
 * Bounded, in-memory development token cache shared by dev-server consumers.
 * Only the trusted host transport may supply identity and policy values. It
 * must authorize every fresh issuance and validate the returned token profile.
 * No timer renews tokens: renewal happens when the getter is called.
 */
export class DevelopmentOidcTokenCache {
	#entries = new Map<string, Entry>();
	#disposed = false;

	/**
	 * Return a token with at least one minute remaining, coalescing fresh issuance.
	 *
	 * @param identity Server-authorized account, Worker, user, session, and policy.
	 * @param audience Effective audience, including the resolved account default.
	 * @param issue Host callback used when no reusable token exists.
	 * @returns The bearer token. Never log or persist the returned value.
	 */
	async getToken(
		identity: DevelopmentOidcIdentity,
		audience: string,
		issue: DevelopmentOidcTokenIssuer
	): Promise<string> {
		if (this.#disposed) {
			throw new Error("The development OIDC session has been disposed.");
		}
		const values = [
			identity.accountId,
			identity.workerId,
			identity.userId,
			identity.developmentSessionId,
			identity.policy,
			audience,
		];
		if (
			values.some((value) => typeof value !== "string" || value.length === 0)
		) {
			throw new Error(
				"Development OIDC requires a complete authorized identity and audience."
			);
		}
		const key = JSON.stringify(values);
		let entry = this.#entries.get(key);
		if (entry?.token) {
			if (isReusable(entry)) {
				this.#entries.delete(key);
				this.#entries.set(key, entry);
				return entry.token.token;
			}
			this.#entries.delete(key);
			entry = undefined;
		}
		if (entry === undefined) {
			if (this.#entries.size >= MAXIMUM_ENTRIES) {
				// Evict a completed LRU entry, never an in-flight request: otherwise
				// an unbounded number of requests could escape the concurrency limit.
				const candidate = [...this.#entries].find(([, value]) => value.token);
				if (candidate === undefined) {
					throw new Error(
						"Too many concurrent development OIDC requests. Try again after an issuance completes."
					);
				}
				this.#entries.delete(candidate[0]);
			}
			const controller = new AbortController();
			const next: Entry = {
				controller,
				// Defer the callback so synchronous throws also release the entry.
				result: Promise.resolve().then(() => issue(controller.signal)),
			};
			entry = next;
			this.#entries.set(key, entry);
		} else {
			this.#entries.delete(key);
			this.#entries.set(key, entry);
		}
		try {
			const token = await entry.result;
			if (entry.controller.signal.aborted) {
				throw new Error(
					"The development OIDC session changed during issuance. Retry the getter."
				);
			}
			const remaining = Math.min(
				token.expiresAt * 1000 - Date.now(),
				entry.monotonicExpiry === undefined
					? Infinity
					: entry.monotonicExpiry - performance.now()
			);
			if (
				typeof token.token !== "string" ||
				token.token.length === 0 ||
				token.token.length > 65_536 ||
				!Number.isSafeInteger(token.expiresAt) ||
				remaining < MINIMUM_LIFETIME_MS ||
				remaining > MAXIMUM_LIFETIME_MS
			) {
				throw new Error(
					"Development OIDC issuance returned an invalid token or lifetime. Retry the getter."
				);
			}
			entry.monotonicExpiry ??= performance.now() + remaining;
			entry.token = { token: token.token, expiresAt: token.expiresAt };
			return token.token;
		} catch (error) {
			if (this.#entries.get(key) === entry) {
				this.#entries.delete(key);
			}
			throw error;
		}
	}

	/** Invalidate tokens and cancel pending issuance after an auth/session change. */
	clear(): void {
		const entries = this.#entries;
		this.#entries = new Map();
		for (const entry of entries.values()) {
			entry.controller.abort();
		}
	}

	/** Cancel pending issuance and prevent reuse after the dev server stops. */
	dispose(): void {
		this.#disposed = true;
		this.clear();
	}
}

function isReusable(entry: Entry): boolean {
	return (
		entry.token !== undefined &&
		entry.monotonicExpiry !== undefined &&
		Math.min(
			entry.token.expiresAt * 1000 - Date.now(),
			entry.monotonicExpiry - performance.now()
		) >= MINIMUM_LIFETIME_MS
	);
}
