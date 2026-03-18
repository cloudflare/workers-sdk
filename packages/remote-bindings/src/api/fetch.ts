import { fetch, Headers } from "undici";
import type { AuthCredentials } from "../types";
import type { HeadersInit, RequestInit, Response } from "undici";

/**
 * Get the Cloudflare API base URL, respecting compliance region settings.
 */
function getApiBaseUrl(complianceRegion?: string): string {
	if (complianceRegion === "eu") {
		return "https://api.cloudflare.com/eu-client/v4";
	}
	return (
		// eslint-disable-next-line turbo/no-undeclared-env-vars -- Matches wrangler's API base URL override
		process.env.CLOUDFLARE_API_BASE_URL ??
		"https://api.cloudflare.com/client/v4"
	);
}

/**
 * Add authentication headers to a request.
 */
function addAuthHeaders(headers: Headers, auth: AuthCredentials): void {
	if ("apiToken" in auth.apiToken) {
		headers.set("Authorization", `Bearer ${auth.apiToken.apiToken}`);
	} else {
		headers.set("X-Auth-Key", auth.apiToken.authKey);
		headers.set("X-Auth-Email", auth.apiToken.authEmail);
	}
}

export interface FetchResultResponse<T> {
	success: boolean;
	result: T;
	errors: Array<{ code: number; message: string }>;
	messages?: string[];
}

/**
 * Make an authenticated fetch request to the Cloudflare API and return the result.
 */
export async function fetchResult<T>(
	auth: AuthCredentials,
	resource: string,
	init: RequestInit = {},
	complianceRegion?: string,
	abortSignal?: AbortSignal
): Promise<T> {
	const baseUrl = getApiBaseUrl(complianceRegion);
	const url = `${baseUrl}${resource}`;

	const headers = new Headers(init.headers as HeadersInit);
	addAuthHeaders(headers, auth);

	const response = await fetch(url, {
		...init,
		headers,
		signal: abortSignal,
	});

	// Clone before consuming so we can read the body as text on parse failure
	const cloned = response.clone();
	let json: FetchResultResponse<T>;
	try {
		json = (await response.json()) as FetchResultResponse<T>;
	} catch {
		const text = await cloned.text().catch(() => "(unreadable body)");
		throw new Error(
			`Cloudflare API request failed: ${response.status} (non-JSON response)\n${text.slice(0, 200)}`
		);
	}

	if (!json.success) {
		const errors = json.errors.map((e) => `${e.code}: ${e.message}`).join("\n");
		throw new Error(
			`Cloudflare API request failed: ${response.status}\n${errors}`
		);
	}

	return json.result;
}

/**
 * Make a raw authenticated fetch request to any URL (e.g., token exchange).
 */
export async function authenticatedFetch(
	url: string,
	auth: AuthCredentials,
	init: RequestInit = {},
	abortSignal?: AbortSignal
): Promise<Response> {
	const headers = new Headers(init.headers as HeadersInit);
	addAuthHeaders(headers, auth);

	return fetch(url, {
		...init,
		headers,
		signal: abortSignal,
	});
}
