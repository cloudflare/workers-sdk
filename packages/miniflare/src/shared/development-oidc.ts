import { Buffer } from "node:buffer";
import { addAbortListener } from "node:events";

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
const REQUEST_TIMEOUT_MS = 30_000;

/**
 * Bound host operations even when an adapter ignores cancellation. An aborted
 * operation retains its slot until the underlying promise settles. Callers stop
 * waiting immediately; transports must still release their own network resources.
 */
export class DevelopmentOidcRequestPool {
	#active = 0;

	/**
	 * Run a host operation with a deadline and a shared concurrency bound.
	 *
	 * @param request Host operation, which must honor the supplied abort signal.
	 * @param parent Session or shutdown cancellation signal.
	 * @returns The operation's result, or a cancellation/timeout error.
	 */
	async run<T>(
		request: (signal: AbortSignal) => Promise<T>,
		parent: AbortSignal
	): Promise<T> {
		parent.throwIfAborted();
		if (this.#active >= MAXIMUM_ENTRIES) {
			throw new Error("Too many concurrent development OIDC requests.");
		}
		this.#active++;
		const controller = new AbortController();
		const signal = AbortSignal.any([parent, controller.signal]);
		const timer = setTimeout(() => {
			controller.abort(
				new Error("The development OIDC request timed out. Retry the getter.")
			);
		}, REQUEST_TIMEOUT_MS);
		timer.unref();
		const result = Promise.resolve().then(() => {
			// Disposal before this microtask must not start network activity.
			signal.throwIfAborted();
			return request(signal);
		});
		return new Promise<T>((resolve, reject) => {
			const subscription = addAbortListener(signal, () => {
				cleanup();
				reject(signal.reason);
			});
			function cleanup() {
				clearTimeout(timer);
				subscription[Symbol.dispose]();
			}
			void result.then(
				(value) => {
					this.#active--;
					cleanup();
					if (signal.aborted) {
						reject(signal.reason);
					} else {
						resolve(value);
					}
				},
				(error: unknown) => {
					this.#active--;
					cleanup();
					reject(error);
				}
			);
		});
	}
}

function isBoundedString(value: unknown, maxBytes: number): value is string {
	return (
		typeof value === "string" &&
		value.length > 0 &&
		value.length <= maxBytes &&
		value.isWellFormed() &&
		Buffer.byteLength(value, "utf8") <= maxBytes
	);
}

/**
 * Validate host-side audience bounds without normalizing the value. The trusted
 * transport must also enforce the signing API's StringOrURI rules.
 *
 * @param audience Audience received from a getter or authorized session.
 */
export function validateDevelopmentOidcAudience(
	audience: unknown
): asserts audience is string {
	if (!isBoundedString(audience, 2048) || audience.trim().length === 0) {
		throw new Error(
			"Development OIDC requires an audience of 1–2048 UTF-8 bytes that is not whitespace-only."
		);
	}
}

/**
 * Copy only bounded identity fields so adapters cannot mutate cache authority.
 *
 * @param identity Server-authorized account, Worker, user, session, and policy.
 * @returns An immutable snapshot containing no transport response data.
 */
export function snapshotDevelopmentOidcIdentity(
	identity: DevelopmentOidcIdentity
): Readonly<DevelopmentOidcIdentity> {
	const snapshot = {
		accountId: identity?.accountId,
		workerId: identity?.workerId,
		userId: identity?.userId,
		developmentSessionId: identity?.developmentSessionId,
		policy: identity?.policy,
	};
	if (Object.values(snapshot).some((value) => !isBoundedString(value, 4096))) {
		throw new Error(
			"Development OIDC requires a complete authorized identity with bounded fields."
		);
	}
	return Object.freeze(snapshot);
}

interface CachedToken extends DevelopmentOidcToken {
	monotonicExpiry: number;
}

interface Entry {
	controller: AbortController;
	result: Promise<Readonly<CachedToken>>;
	token?: Readonly<CachedToken>;
}

/**
 * Bounded, in-memory development token cache shared by dev-server consumers.
 * Only the trusted host transport may supply identity and policy values. It
 * must authorize every fresh issuance and validate the returned token profile.
 * No timer renews tokens: renewal happens when the getter is called.
 */
export class DevelopmentOidcTokenCache {
	#entries = new Map<string, Entry>();
	#requests = new DevelopmentOidcRequestPool();
	#waiters = 0;
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
		validateDevelopmentOidcAudience(audience);
		const key = JSON.stringify([
			...Object.values(snapshotDevelopmentOidcIdentity(identity)),
			audience,
		]);
		let entry = this.#entries.get(key);
		if (entry?.token) {
			if (isReusable(entry.token)) {
				this.#entries.delete(key);
				this.#entries.set(key, entry);
				return entry.token.token;
			}
			this.#entries.delete(key);
			entry = undefined;
		}
		if (this.#waiters >= MAXIMUM_ENTRIES) {
			throw new Error("Too many concurrent development OIDC requests.");
		}
		if (entry === undefined) {
			if (this.#entries.size >= MAXIMUM_ENTRIES) {
				const candidate = [...this.#entries].find(([, value]) => value.token);
				if (candidate === undefined) {
					throw new Error("Too many concurrent development OIDC requests.");
				}
				this.#entries.delete(candidate[0]);
			}
			const controller = new AbortController();
			entry = {
				controller,
				result: this.#requests.run(async (signal) => {
					const response = await issue(signal);
					signal.throwIfAborted();
					const token = response?.token;
					const expiresAt = response?.expiresAt;
					const remaining =
						typeof expiresAt === "number" ? expiresAt * 1000 - Date.now() : NaN;
					if (
						!isBoundedString(token, 65_536) ||
						!Number.isSafeInteger(expiresAt) ||
						remaining < MINIMUM_LIFETIME_MS ||
						remaining > MAXIMUM_LIFETIME_MS
					) {
						throw new Error(
							"Development OIDC issuance returned an invalid token or lifetime. Retry the getter."
						);
					}
					// Retain only this snapshot, never the mutable transport response.
					return Object.freeze({
						token,
						expiresAt,
						monotonicExpiry: performance.now() + remaining,
					});
				}, controller.signal),
			};
			this.#entries.set(key, entry);
		} else {
			this.#entries.delete(key);
			this.#entries.set(key, entry);
		}
		this.#waiters++;
		try {
			const token = await entry.result;
			entry.controller.signal.throwIfAborted();
			if (!isReusable(token)) {
				throw new Error(
					"Development OIDC issuance returned an invalid token or lifetime. Retry the getter."
				);
			}
			entry.token = token;
			return token.token;
		} catch (error) {
			if (this.#entries.get(key) === entry) {
				this.#entries.delete(key);
			}
			throw error;
		} finally {
			this.#waiters--;
		}
	}

	/** Invalidate tokens and cancel pending issuance after an auth/session change. */
	clear(): void {
		const entries = this.#entries;
		this.#entries = new Map();
		for (const entry of entries.values()) {
			entry.controller.abort(
				new Error(
					"The development OIDC session changed during issuance. Retry the getter."
				)
			);
		}
	}

	/** Cancel pending issuance and prevent reuse after the dev server stops. */
	dispose(): void {
		this.#disposed = true;
		this.clear();
	}
}

function isReusable(token: CachedToken): boolean {
	return (
		Math.min(
			token.expiresAt * 1000 - Date.now(),
			token.monotonicExpiry - performance.now()
		) >= MINIMUM_LIFETIME_MS
	);
}
