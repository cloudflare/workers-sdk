import assert from "node:assert";
import { fetch, FormData, Headers, Response } from "undici";
import { version as wranglerVersion } from "../../package.json";
import { getCloudflareApiBaseUrl } from "../environment-variables/misc-variables";
import { UserError } from "../errors";
import { logger } from "../logger";
import { APIError, parseJSON } from "../parse";
import { loginOrRefreshIfRequired, requireApiToken } from "../user";
import type { ComplianceConfig } from "../environment-variables/misc-variables";
import type { ApiCredentials } from "../user";
import type { URLSearchParams } from "node:url";
import type { HeadersInit, RequestInit } from "undici";

/*
 * performApiFetch does everything required to make a CF API request,
 * but doesn't parse the response as JSON. For normal V4 API responses,
 * use `fetchInternal`
 * */
export async function performApiFetch(
	complianceConfig: ComplianceConfig,
	resource: string,
	init: RequestInit = {},
	queryParams?: URLSearchParams,
	abortSignal?: AbortSignal,
	apiToken?: ApiCredentials
) {
	const method = init.method ?? "GET";
	assert(
		resource.startsWith("/"),
		`CF API fetch - resource path must start with a "/" but got "${resource}"`
	);
	await requireLoggedIn(complianceConfig);
	apiToken ??= requireApiToken();
	const headers = cloneHeaders(new Headers(init.headers));
	addAuthorizationHeaderIfUnspecified(headers, apiToken);
	addUserAgent(headers);

	const queryString = queryParams ? `?${queryParams.toString()}` : "";
	logger.debug(
		`-- START CF API REQUEST: ${method} ${getCloudflareApiBaseUrl(complianceConfig)}${resource}`
	);
	logger.debugWithSanitization("QUERY STRING:", queryString);
	logHeaders(headers);

	logger.debugWithSanitization("INIT:", JSON.stringify({ ...init }, null, 2));
	if (init.body instanceof FormData) {
		logger.debugWithSanitization(
			"BODY:",
			await new Response(init.body).text(),
			null,
			2
		);
	}
	logger.debug("-- END CF API REQUEST");
	return await fetch(
		`${getCloudflareApiBaseUrl(complianceConfig)}${resource}${queryString}`,
		{
			method,
			...init,
			headers,
			signal: abortSignal,
		}
	);
}

function logHeaders(headers: Headers) {
	headers = cloneHeaders(headers);
	headers.delete("Authorization");
	logger.debugWithSanitization(
		"HEADERS:",
		JSON.stringify(Object.fromEntries(headers), null, 2)
	);
}

/**
 * Make a fetch request to the Cloudflare API.
 *
 * This function handles acquiring the API token and logging the caller in, as necessary.
 *
 * Check out https://api.cloudflare.com/ for API docs.
 *
 * This function should not be used directly, instead use the functions in `cfetch/index.ts`.
 */
export async function fetchInternal<ResponseType>(
	complianceConfig: ComplianceConfig,
	resource: string,
	init: RequestInit = {},
	queryParams?: URLSearchParams,
	abortSignal?: AbortSignal,
	apiToken?: ApiCredentials
): Promise<ResponseType> {
	const method = init.method ?? "GET";
	const response = await performApiFetch(
		complianceConfig,
		resource,
		init,
		queryParams,
		abortSignal,
		apiToken
	);
	const jsonText = await response.text();
	logger.debug(
		"-- START CF API RESPONSE:",
		response.statusText,
		response.status
	);
	logHeaders(response.headers);
	logger.debugWithSanitization("RESPONSE:", jsonText);
	logger.debug("-- END CF API RESPONSE");

	// HTTP 204 and HTTP 205 responses do not return a body. We need to special-case this
	// as otherwise parseJSON will throw an error back to the user.
	if (!jsonText && (response.status === 204 || response.status === 205)) {
		const emptyBody = `{"result": {}, "success": true, "errors": [], "messages": []}`;
		return parseJSON(emptyBody) as ResponseType;
	}

	try {
		return parseJSON(jsonText) as ResponseType;
	} catch {
		throw new APIError({
			text: "Received a malformed response from the API",
			notes: [
				{
					text: truncate(jsonText, 100),
				},
				{
					text: `${method} ${resource} -> ${response.status} ${response.statusText}`,
				},
			],
			status: response.status,
		});
	}
}

function truncate(text: string, maxLength: number): string {
	const { length } = text;
	if (length <= maxLength) {
		return text;
	}
	return `${text.substring(0, maxLength)}... (length = ${length})`;
}

function cloneHeaders(headers: HeadersInit | undefined): Headers {
	return new Headers(headers);
}

export async function requireLoggedIn(
	complianceConfig: ComplianceConfig
): Promise<void> {
	const loggedIn = await loginOrRefreshIfRequired(complianceConfig);
	if (!loggedIn) {
		throw new UserError("Not logged in.");
	}
}

export function addAuthorizationHeaderIfUnspecified(
	headers: Headers,
	auth: ApiCredentials
): void {
	if (!headers.has("Authorization")) {
		if ("apiToken" in auth) {
			headers.set("Authorization", `Bearer ${auth.apiToken}`);
		} else {
			headers.set("X-Auth-Key", auth.authKey);
			headers.set("X-Auth-Email", auth.authEmail);
		}
	}
}

export function addUserAgent(headers: Headers): void {
	headers.set("User-Agent", `wrangler/${wranglerVersion}`);
}

/**
 * The implementation for fetching a kv value from the cloudflare API.
 * We special-case this one call, because it's the only API call that
 * doesn't return json. We inline the implementation and try not to share
 * any code with the other calls. We should push back on any new APIs that
 * try to introduce non-"standard" response structures.
 *
 * Note: any calls to fetchKVGetValue must call encodeURIComponent on key
 * before passing it
 */
export async function fetchKVGetValue(
	complianceConfig: ComplianceConfig,
	accountId: string,
	namespaceId: string,
	key: string
): Promise<ArrayBuffer> {
	await requireLoggedIn(complianceConfig);
	const auth = requireApiToken();
	const headers = new Headers();
	addAuthorizationHeaderIfUnspecified(headers, auth);
	const resource = `${getCloudflareApiBaseUrl(complianceConfig)}/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/values/${key}`;
	const response = await fetch(resource, {
		method: "GET",
		headers,
	});
	if (response.ok) {
		return await response.arrayBuffer();
	} else {
		throw new Error(
			`Failed to fetch ${resource} - ${response.status}: ${response.statusText});`
		);
	}
}

/**
 * The implementation for fetching a R2 object from Cloudflare API.
 * We have a special implementation to handle the non-standard API response
 * that doesn't return JSON, likely due to the streaming nature.
 *
 * note: The implementation should be called from light wrappers for
 * different methods (GET, PUT)
 */
type ResponseWithBody = Response & { body: NonNullable<Response["body"]> };
export async function fetchR2Objects(
	complianceConfig: ComplianceConfig,
	resource: string,
	bodyInit: RequestInit = {}
): Promise<ResponseWithBody | null> {
	await requireLoggedIn(complianceConfig);
	const auth = requireApiToken();
	const headers = cloneHeaders(bodyInit.headers);
	addAuthorizationHeaderIfUnspecified(headers, auth);
	addUserAgent(headers);

	const response = await fetch(
		`${getCloudflareApiBaseUrl(complianceConfig)}${resource}`,
		{
			...bodyInit,
			headers,
		}
	);

	if (response.ok && response.body) {
		return response as ResponseWithBody;
	} else if (response.status === 404) {
		return null;
	} else {
		throw new Error(
			`Failed to fetch ${resource} - ${response.status}: ${response.statusText});`
		);
	}
}

/**
 * This is a wrapper STOPGAP for getting the script which returns a raw text response.
 */
export async function fetchWorkerDefinitionFromDash(
	complianceConfig: ComplianceConfig,
	resource: string,
	bodyInit: RequestInit = {}
): Promise<{ entrypoint: string; modules: File[] }> {
	await requireLoggedIn(complianceConfig);
	const auth = requireApiToken();
	const headers = cloneHeaders(bodyInit.headers);
	addAuthorizationHeaderIfUnspecified(headers, auth);
	addUserAgent(headers);

	let response = await fetch(
		`${getCloudflareApiBaseUrl(complianceConfig)}${resource}`,
		{
			...bodyInit,
			headers,
		}
	);

	if (!response.ok || !response.body) {
		logger.error(response.ok, response.body);
		throw new Error(
			`Failed to fetch ${resource} - ${response.status}: ${response.statusText});`
		);
	}

	const usesModules = response.headers
		.get("content-type")
		?.startsWith("multipart");

	if (usesModules) {
		// For testing purposes only, sorry not sorry -- msw doesn't implement Response#formData
		if (!response.formData) {
			response = new Response(await response.text(), response);
		}

		const form = await response.formData();
		const files = Array.from(form.entries()).map(([filename, contents]) =>
			contents instanceof File ? contents : new File([contents], filename)
		);

		return {
			entrypoint: response.headers.get("cf-entrypoint") ?? "src/index.js",
			modules: files,
		};
	} else {
		const contents = await response.text();
		const file = new File([contents], "index.js", { type: "text" });

		return {
			entrypoint: "index.js",
			modules: [file],
		};
	}
}
