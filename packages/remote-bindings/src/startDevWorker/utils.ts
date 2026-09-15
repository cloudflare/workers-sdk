import assert from "node:assert";
import type { Hook, HookValues } from "@cloudflare/workers-utils";

/**
 * When to proactively refresh the preview token.
 *
 * Preview tokens expire after 1 hour (hardcoded in the Workers control plane), so we retry after 50 mins.
 */
export const PREVIEW_TOKEN_REFRESH_INTERVAL = 50 * 60 * 1000;

export type MaybePromise<T> = T | Promise<T>;
export type DeferredPromise<T> = {
	promise: Promise<T>;
	resolve: (_: MaybePromise<T>) => void;
	reject: (_: Error) => void;
};

export function createDeferred<T>(
	previousDeferred?: DeferredPromise<T>
): DeferredPromise<T> {
	let resolve, reject;
	const newPromise = new Promise<T>((_resolve, _reject) => {
		resolve = _resolve;
		reject = _reject;
	});
	assert(resolve);
	assert(reject);

	// if passed a previousDeferred, ensure it is resolved with the newDeferred
	// so that await-ers of previousDeferred are now await-ing newDeferred
	previousDeferred?.resolve(newPromise);

	return {
		promise: newPromise,
		resolve,
		reject,
	};
}

export function urlFromParts(
	parts: Partial<URL>,
	base = "http://localhost"
): URL {
	const url = new URL(base);

	Object.assign(url, parts);

	return url;
}

/**
 * Rewrites the absolute URLs inside a single header value (e.g. `Location`,
 * `Origin`, `Access-Control-Allow-Origin`), mapping only those whose host
 * that match the target host.
 *
 * This function ensures that the host is replaced in a robust manner avoiding
 * corruptions (that can happen for example if a naive replacement was used).
 *
 * @param value - The raw header value string that may contain absolute URLs to rewrite.
 * @param from - The URL whose host should be matched against URLs found in the header value.
 * @param to - The URL whose origin will replace the matched origin in the header value.
 * @returns The header value string with all matching absolute URLs rewritten to use the target origin.
 */
export function rewriteUrlInHeaderValue(
	value: string,
	from: URL,
	to: URL
): string {
	// Split each absolute URL into its `scheme://authority` origin and the
	// literal remainder (path/query/fragment). Keeping the remainder verbatim
	// avoids URL normalization such as appending a trailing slash to a bare
	// origin (which would corrupt an `Origin` header), and leaves host-like
	// substrings inside query strings untouched.
	return value.replace(
		/(https?:\/\/[^/?#\s,;"']+)([^\s,;"']*)/gi,
		(match, origin: string, rest: string) => {
			let url: URL;
			try {
				url = new URL(origin);
			} catch {
				return match;
			}
			if (url.host !== from.host) {
				return match;
			}
			return to.origin + rest;
		}
	);
}

type UnwrapHook<
	T extends HookValues | Promise<HookValues>,
	Args extends unknown[],
> = Hook<T, Args>;

export function unwrapHook<
	T extends HookValues | Promise<HookValues>,
	Args extends unknown[],
>(hook: UnwrapHook<T, Args>, ...args: Args): T {
	return typeof hook === "function" ? hook(...args) : hook;
}
