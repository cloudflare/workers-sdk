import { Buffer } from "node:buffer";
import { addAbortListener } from "node:events";
import { validOidcAudience } from "@cloudflare/workers-utils/oidc";

/** The server-authorized identity that own a development token. */
export interface DevelopmentOidcIdentity {
	accountId: string;
	workerId: string;
	userId: string;
	developmentSessionId: string;
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

/** A bounded host request timed out without invalidating its authorized session. */
export class DevelopmentOidcRequestTimeoutError extends Error {
	constructor() {
		super("The development OIDC request timed out. Retry the getter.");
	}
}

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
			controller.abort(new DevelopmentOidcRequestTimeoutError());
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
 * Validate the same exact StringOrURI grammar as the signing API.
 *
 * @param audience Audience received from a getter or authorized session.
 */
export function validateDevelopmentOidcAudience(
	audience: unknown
): asserts audience is string {
	if (!validOidcAudience(audience)) {
		throw new Error(
			"Development OIDC requires a StringOrURI audience of 1–2048 UTF-8 bytes that is not whitespace-only."
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

/** Bound and validate each issuance. Every invocation issues a fresh assertion after current authorization. */
export class DevelopmentOidcTokenRequests {
	#requests = new DevelopmentOidcRequestPool();
	#controller = new AbortController();
	#disposed = false;
	async getToken(
		identity: DevelopmentOidcIdentity,
		audience: string,
		issue: DevelopmentOidcTokenIssuer
	): Promise<string> {
		if (this.#disposed) {
			throw new Error("The development OIDC session has been disposed.");
		}
		snapshotDevelopmentOidcIdentity(identity);
		validateDevelopmentOidcAudience(audience);
		const controller = this.#controller;
		const token = await this.#requests.run(async (signal) => {
			const response = await issue(signal);
			signal.throwIfAborted();
			const token = response?.token,
				expiresAt = response?.expiresAt;
			const remaining = expiresAt * 1000 - Date.now();
			if (
				!isBoundedString(token, 65536) ||
				!Number.isSafeInteger(expiresAt) ||
				remaining < MINIMUM_LIFETIME_MS ||
				remaining > MAXIMUM_LIFETIME_MS
			) {
				throw new Error(
					"Development OIDC issuance returned an invalid token or lifetime. Retry the getter."
				);
			}
			return {
				token,
				expiresAt,
				monotonicExpiry: performance.now() + remaining,
			};
		}, controller.signal);
		controller.signal.throwIfAborted();
		if (!isReusable(token)) {
			throw new Error(
				"Development OIDC issuance returned an invalid token or lifetime. Retry the getter."
			);
		}
		return token.token;
	}
	clear(): void {
		this.#controller.abort(
			new Error(
				"The development OIDC session changed during issuance. Retry the getter."
			)
		);
		this.#controller = new AbortController();
	}
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
