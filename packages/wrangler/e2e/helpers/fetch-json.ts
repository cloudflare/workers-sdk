import { fetch, Request } from "undici";
import { waitForLong } from "./wait-for";
import type { RequestInit } from "undici";

/**
 * Fetch a URL, parse the response as JSON, and retry until it succeeds.
 * Uses `waitForLong` internally so it will keep retrying on network errors
 * or non-JSON responses until the timeout is reached.
 */
export async function fetchJson<T>(
	url: string,
	info?: RequestInit
): Promise<T> {
	return waitForLong(async () => {
		const request = new Request(url, info);
		const headers = new Headers(request.headers);
		headers.set("MF-Disable-Pretty-Error", "true");
		const text: string = await fetch(request, {
			headers,
		}).then((r) => r.text());
		try {
			return JSON.parse(text) as T;
		} catch (cause) {
			const err = new Error(`Failed to parse JSON from:\n${text}`);
			err.cause = cause;
			throw err;
		}
	});
}
