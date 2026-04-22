import assert from "node:assert";
import {
	APIError,
	getCloudflareApiBaseUrl,
	getTraceHeader,
	parseJSON,
	UserError,
} from "@cloudflare/workers-utils";
import Cloudflare from "cloudflare";
import { fetch, FormData, Headers, Request, Response } from "undici";
import { version as wranglerVersion } from "../../package.json";
import { logger } from "../logger";
import { loginOrRefreshIfRequired, requireApiToken } from "../user";
import type { ApiCredentials } from "../user";
import type { ComplianceConfig, Message } from "@cloudflare/workers-utils";
import type { URLSearchParams } from "node:url";
import type { HeadersInit, RequestInfo, RequestInit } from "undici";

async function logRequest(request: Request, init?: RequestInit) {
	logger.debug(`-- START CF API REQUEST: ${request.method} ${request.url}`);
	const logRequestHeaders = cloneHeaders(request.headers);
	logRequestHeaders.delete("Authorization");
	logger.debugWithSanitization(
		"HEADERS:",
		JSON.stringify(logRequestHeaders, null, 2)
	);

	logger.debugWithSanitization("INIT:", JSON.stringify({ ...init }, null, 2));
	if (request.body instanceof FormData) {
		logger.debugWithSanitization(
			"BODY:",
			await new Response(request.body).text(),
			null,
			2
		);
	}
	logger.debug("-- END CF API REQUEST");
}

async function logResponse(response: Response) {
	const jsonText = await response.clone().text();
	logger.debug(
		"-- START CF API RESPONSE:",
		response.statusText,
		response.status
	);
	const logResponseHeaders = cloneHeaders(response.headers);
	logResponseHeaders.delete("Authorization");
	logger.debugWithSanitization(
		"HEADERS:",
		JSON.stringify(logResponseHeaders, null, 2)
	);
	logger.debugWithSanitization("RESPONSE:", jsonText);
	logger.debug("-- END CF API RESPONSE");
}
/**
 * This function constructs an instance of the `Cloudflare` SDK client,
 * with a custom fetcher that uses `fetchInternal`.
 */
export function createCloudflareClient(complianceConfig: ComplianceConfig) {
	return new Cloudflare({
		fetch: async (url: RequestInfo, init?: RequestInit): Promise<Response> => {
			const request = new Request(url, { ...init, duplex: "half" });
			await requireLoggedIn(complianceConfig);
			const apiToken = requireApiToken();

			addAuthorizationHeader(
				request.headers,
				apiToken,
				/* The CF SDK will inject `Bearer dummy` */ true
			);
			addUserAgent(request.headers);

			await logRequest(request, init);

			const response = await fetch(request.url, request);
			await logResponse(response);
			return response;
		},
		baseURL: getCloudflareApiBaseUrl(complianceConfig),
	});
}

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
	addAuthorizationHeader(headers, apiToken);
	addUserAgent(headers);
	maybeAddTraceHeader(headers);

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
): Promise<{ response: ResponseType; status: number }> {
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
		return {
			response: {
				result: {},
				success: true,
				errors: [],
				messages: [],
			} as ResponseType,
			status: response.status,
		};
	}

	// Detect Cloudflare WAF block pages via the cf-mitigated response header.
	// Without this check, the JSON parser throws a confusing "malformed response" error.
	if (isWAFBlockResponse(response.headers)) {
		throwWAFBlockError(
			response.headers,
			method,
			resource,
			response.status,
			response.statusText
		);
	}

	try {
		const json = parseJSON(jsonText) as ResponseType;
		return { response: json, status: response.status };
	} catch {
		const rayId = extractWAFBlockRayId(response.headers);

		throw new APIError({
			text: "Received a malformed response from the API",
			notes: [
				{
					text: truncate(jsonText, 100),
				},
				{
					text: `${method} ${resource} -> ${response.status} ${response.statusText}`,
				},
				...(rayId ? [{ text: `Cloudflare Ray ID: ${rayId}` }] : []),
			],
			status: response.status,
		});
	}
}

export function truncate(text: string, maxLength: number): string {
	const { length } = text;
	if (length <= maxLength) {
		return text;
	}
	return `${text.substring(0, maxLength)}... (length = ${length})`;
}

/**
 * Checks whether the response was blocked by Cloudflare's WAF by inspecting
 * the `cf-mitigated` response header. When the WAF blocks or challenges a
 * request the response will include `cf-mitigated: challenge`.
 *
 * @see https://developers.cloudflare.com/cloudflare-challenges/challenge-types/challenge-pages/detect-response/
 *
 * @param headers - The response headers to inspect.
 * @returns `true` if the response was mitigated by the WAF.
 */
export function isWAFBlockResponse(headers: Headers): boolean {
	return headers.get("cf-mitigated") === "challenge";
}

/**
 * Extracts the Cloudflare Ray ID from the `cf-ray` response header.
 *
 * @param headers - The response headers to inspect.
 * @returns The Ray ID string, or `undefined` if the header is absent.
 */
export function extractWAFBlockRayId(headers: Headers): string | undefined {
	return headers.get("cf-ray") ?? undefined;
}

/**
 * Throws a descriptive {@link APIError} for a WAF block response.
 *
 * @param headers - The response headers (used to extract the Ray ID).
 * @param method - The HTTP method of the blocked request.
 * @param resource - The URL or path that was requested.
 * @param status - The HTTP status code returned.
 * @param statusText - The HTTP status text returned.
 * @throws {APIError} Always — this function never returns.
 */
function throwWAFBlockError(
	headers: Headers,
	method: string,
	resource: string,
	status: number,
	statusText: string
): never {
	const rayId = extractWAFBlockRayId(headers);
	throw new APIError({
		text: "The Cloudflare API responded with a WAF block page instead of the expected JSON response",
		notes: [
			{
				text: "Cloudflare's firewall (WAF) blocked this API request. This is usually a false positive.",
			},
			...(rayId ? [{ text: `Cloudflare Ray ID: ${rayId}` }] : []),
			{
				text: rayId
					? "If the issue persists, please open a Cloudflare Support ticket and include the Ray ID above."
					: "If the issue persists, please open a Cloudflare Support ticket. You can find the Cloudflare Ray ID on the block page in your browser.",
			},
			{
				text: `${method} ${resource} -> ${status} ${statusText}`,
			},
		],
		status,
	});
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

export function addAuthorizationHeader(
	headers: Headers,
	auth: ApiCredentials,
	overrideExisting = false
): void {
	if (!headers.has("Authorization") || overrideExisting) {
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

export function maybeAddTraceHeader(headers: Headers): void {
	const traceHeader = getTraceHeader();
	if (traceHeader) {
		headers.set("Cf-Trace-Id", traceHeader);
	}
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
	addAuthorizationHeader(headers, auth);
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
	addAuthorizationHeader(headers, auth);
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
		// Read response body to get detailed error message
		const notes: Message[] = [];
		let errorCode: number | undefined;
		try {
			const bodyText = await response.text();
			// Attempt to parse as a standard Cloudflare API JSON envelope to
			// extract the structured error code (e.g. for data catalog conflicts).
			try {
				const json = JSON.parse(bodyText) as {
					errors?: Array<{ code?: number; message?: string }>;
				};
				errorCode = json.errors?.[0]?.code;
			} catch {
				// Not JSON — fall through and use raw text as the note
			}
			notes.push({ text: bodyText });
		} catch {
			// If we can't read the body, continue without it
		}
		const apiError = new APIError({
			text: `Failed to fetch ${resource} - ${response.status}: ${response.statusText};`,
			status: response.status,
			notes,
		});
		if (errorCode !== undefined) {
			apiError.code = errorCode;
		}
		throw apiError;
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
	addAuthorizationHeader(headers, auth);
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
