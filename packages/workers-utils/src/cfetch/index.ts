import assert from "node:assert";
import { URLSearchParams } from "node:url";
import { fetch, FormData, Headers, Response } from "undici";
import {
	getCloudflareApiBaseUrl,
	getTraceHeader,
} from "../environment-variables/misc-variables";
import { UserError } from "../errors";
import { APIError, parseJSON } from "../parse";
import { type FetchError, maybeThrowFriendlyError } from "./errors";
import type { ComplianceConfig } from "../environment-variables/misc-variables";
import type { Logger } from "../logger";
import type { HeadersInit, RequestInit } from "undici";

export type ApiCredentials =
	| {
			apiToken: string;
	  }
	| {
			authKey: string;
			authEmail: string;
	  };

export interface FetchResult<ResponseType = unknown> {
	success: boolean;
	result: ResponseType;
	errors: FetchError[];
	messages?: (string | { code?: number; message: string })[];
	result_info?: unknown;
}

export type FetchResultFetcher = <ResponseType>(
	complianceConfig: ComplianceConfig,
	resource: string,
	init?: RequestInit,
	queryParams?: URLSearchParams,
	abortSignal?: AbortSignal
) => Promise<ResponseType>;

export type FetchListResultFetcher = <ResponseType>(
	complianceConfig: ComplianceConfig,
	resource: string,
	init?: RequestInit,
	queryParams?: URLSearchParams
) => Promise<ResponseType[]>;

export type FetchPagedListResultFetcher = <ResponseType>(
	complianceConfig: ComplianceConfig,
	resource: string,
	init?: RequestInit,
	queryParams?: URLSearchParams
) => Promise<ResponseType[]>;

function logHeaders(headers: Headers, logger: Logger): void {
	const clone = cloneHeaders(headers);
	clone.delete("Authorization");
	logger.debugWithSanitization?.(
		"HEADERS:",
		JSON.stringify(Object.fromEntries(clone), null, 2)
	);
}

/**
 *
 * Note this requires its caller to handle credentials
 * (need to call requireLoggedIn and requireApiToken)
 */
export async function performApiFetchBase(
	complianceConfig: ComplianceConfig,
	resource: string,
	init: RequestInit = {},
	userAgent: string,
	logger: Logger,
	queryParams?: URLSearchParams,
	abortSignal?: AbortSignal,
	credentials?: ApiCredentials
): Promise<Response> {
	assert(credentials, "credentials are required for performApiFetch");
	const method = init.method ?? "GET";
	assert(
		resource.startsWith("/"),
		`CF API fetch - resource path must start with a "/" but got "${resource}"`
	);
	const headers = cloneHeaders(new Headers(init.headers));
	addAuthorizationHeader(headers, credentials);
	headers.set("User-Agent", userAgent);
	maybeAddTraceHeader(headers);

	const queryString = queryParams ? `?${queryParams.toString()}` : "";
	logger.debug(
		`-- START CF API REQUEST: ${method} ${getCloudflareApiBaseUrl(complianceConfig)}${resource}`
	);
	logger.debugWithSanitization?.("QUERY STRING:", queryString);
	logHeaders(headers, logger);

	logger.debugWithSanitization?.("INIT:", JSON.stringify({ ...init }, null, 2));
	if (init.body instanceof FormData) {
		logger.debugWithSanitization?.(
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

export async function fetchInternalBase<ResponseType>(
	complianceConfig: ComplianceConfig,
	resource: string,
	init: RequestInit = {},
	userAgent: string,
	logger: Logger,
	queryParams?: URLSearchParams,
	abortSignal?: AbortSignal,
	credentials?: ApiCredentials
): Promise<{
	response: ResponseType;
	status: number;
	retryAfterMs?: number;
}> {
	const method = init.method ?? "GET";
	const response = await performApiFetchBase(
		complianceConfig,
		resource,
		init,
		userAgent,
		logger,
		queryParams,
		abortSignal,
		credentials
	);
	const jsonText = await response.text();
	logger.debug(
		"-- START CF API RESPONSE:",
		response.statusText,
		response.status
	);
	logHeaders(response.headers, logger);
	logger.debugWithSanitization?.("RESPONSE:", jsonText);
	logger.debug("-- END CF API RESPONSE");

	const retryAfterMs = parseRetryAfterMs(response.headers);

	if (!jsonText && (response.status === 204 || response.status === 205)) {
		return {
			response: {
				result: {},
				success: true,
				errors: [],
				messages: [],
			} as ResponseType,
			status: response.status,
			retryAfterMs,
		};
	}

	if (isWAFBlockResponse(response.headers)) {
		throwWAFBlockError(
			response.headers,
			method,
			resource,
			response.status,
			response.statusText,
			retryAfterMs
		);
	}

	try {
		const json = parseJSON(jsonText) as ResponseType;
		return { response: json, status: response.status, retryAfterMs };
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
			retryAfterMs,
			telemetryMessage: false,
		});
	}
}

export async function fetchResultBase<ResponseType>(
	complianceConfig: ComplianceConfig,
	resource: string,
	init: RequestInit = {},
	userAgent: string,
	logger: Logger,
	queryParams?: URLSearchParams,
	abortSignal?: AbortSignal,
	credentials?: ApiCredentials
): Promise<ResponseType> {
	const {
		response: json,
		status,
		retryAfterMs,
	} = await fetchInternalBase<FetchResult<ResponseType>>(
		complianceConfig,
		resource,
		init,
		userAgent,
		logger,
		queryParams,
		abortSignal,
		credentials
	);
	if (json.success) {
		return json.result;
	} else {
		throwFetchError(resource, json, status, retryAfterMs);
	}
}

export async function fetchListResultBase<ResponseType>(
	complianceConfig: ComplianceConfig,
	resource: string,
	init: RequestInit = {},
	userAgent: string,
	logger: Logger,
	queryParams?: URLSearchParams,
	credentials?: ApiCredentials
): Promise<ResponseType[]> {
	const results: ResponseType[] = [];
	let getMoreResults = true;
	let cursor: string | undefined;
	while (getMoreResults) {
		if (cursor) {
			queryParams = new URLSearchParams(queryParams);
			queryParams.set("cursor", cursor);
		}
		const {
			response: json,
			status,
			retryAfterMs,
		} = await fetchInternalBase<FetchResult<ResponseType[]>>(
			complianceConfig,
			resource,
			init,
			userAgent,
			logger,
			queryParams,
			undefined,
			credentials
		);
		if (json.success) {
			results.push(...json.result);
			if (hasCursor(json.result_info)) {
				cursor = json.result_info?.cursor;
			} else {
				getMoreResults = false;
			}
		} else {
			throwFetchError(resource, json, status, retryAfterMs);
		}
	}
	return results;
}

export function truncate(text: string, maxLength: number): string {
	const { length } = text;
	if (length <= maxLength) {
		return text;
	}
	return `${text.substring(0, maxLength)}... (length = ${length})`;
}

export function isWAFBlockResponse(headers: Headers): boolean {
	return headers.get("cf-mitigated") === "challenge";
}

/**
 * Parses a `Retry-After` header value (https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Retry-After)
 * into milliseconds to wait before retrying, or `undefined` if absent/unparsable.
 *
 * Per the HTTP spec, `Retry-After` may either be a number of delay-seconds,
 * or an HTTP-date after which the request may be retried.
 */
export function parseRetryAfterValue(
	retryAfter: string | null | undefined
): number | undefined {
	if (!retryAfter) {
		return undefined;
	}

	// delta-seconds, e.g. "Retry-After: 120"
	if (/^\d+$/.test(retryAfter.trim())) {
		return Number(retryAfter) * 1000;
	}

	// HTTP-date, e.g. "Retry-After: Fri, 31 Dec 1999 23:59:59 GMT"
	const retryAfterDate = new Date(retryAfter);
	if (!Number.isNaN(retryAfterDate.getTime())) {
		return Math.max(0, retryAfterDate.getTime() - Date.now());
	}

	return undefined;
}

/** Same as {@link parseRetryAfterValue}, reading the value from a `Headers` object. */
export function parseRetryAfterMs(headers: Headers): number | undefined {
	return parseRetryAfterValue(headers.get("Retry-After"));
}

export function extractWAFBlockRayId(headers: Headers): string | undefined {
	return headers.get("cf-ray") ?? undefined;
}

export function extractAccountTag(resource: string): string | undefined {
	const re = new RegExp("/accounts/([a-zA-Z0-9]+)/?");
	const matches = re.exec(resource);
	return matches?.[1];
}

interface PageResultInfo {
	page: number;
	per_page: number;
	count: number;
	total_count: number;
}

export function hasMorePages(
	result_info: unknown
): result_info is PageResultInfo {
	const page = (result_info as PageResultInfo | undefined)?.page;
	const per_page = (result_info as PageResultInfo | undefined)?.per_page;
	const total = (result_info as PageResultInfo | undefined)?.total_count;

	return (
		page !== undefined &&
		per_page !== undefined &&
		total !== undefined &&
		page * per_page < total
	);
}

export function renderError(
	err:
		| FetchError
		| { code?: number; message?: string; documentation_url?: string },
	level = 0
): string {
	const indent = "  ".repeat(level);
	const message = err.message ?? "";
	const chainedMessages =
		"error_chain" in err
			? ((err as FetchError).error_chain
					?.map(
						(chainedError) =>
							`\n\n${indent}- ${renderError(chainedError, level + 1)}`
					)
					.join("\n") ?? "")
			: "";
	return (
		(err.code ? `${message} [code: ${err.code}]` : message) +
		(err.documentation_url
			? `\n${indent}To learn more about this error, visit: ${err.documentation_url}`
			: "") +
		chainedMessages
	);
}

export function addAuthorizationHeader(
	headers: Headers,
	auth: ApiCredentials,
	overrideExisting = false
): void {
	if (!headers.has("Authorization") || overrideExisting) {
		if ("apiToken" in auth) {
			const authorizationHeader = `Bearer ${auth.apiToken}`;
			validateAuthorizationHeaderValue(authorizationHeader);
			headers.set("Authorization", authorizationHeader);
		} else {
			headers.set("X-Auth-Key", auth.authKey);
			headers.set("X-Auth-Email", auth.authEmail);
		}
	}
}

function validateAuthorizationHeaderValue(value: string): void {
	for (const character of value) {
		const codePoint = character.codePointAt(0);
		if (codePoint === undefined || codePoint > 255) {
			throw new UserError(
				`The configured Cloudflare API token contains a character that cannot be used in an HTTP Authorization header: ${formatAuthorizationHeaderCharacter(character, codePoint)}. Recreate or copy the token again, making sure it does not include characters such as ellipses.`,
				{
					telemetryMessage: "cfetch auth invalid authorization header",
				}
			);
		}
	}
}

function formatAuthorizationHeaderCharacter(
	character: string,
	codePoint: number | undefined
): string {
	if (codePoint === undefined) {
		return '"\\u{unknown}"';
	}

	const codePointLabel = `U+${codePoint.toString(16).toUpperCase().padStart(4, "0")}`;
	const characterLabel = isPrintableCharacter(character)
		? `"${character}"`
		: `"${escapeCharacter(character)}"`;

	return `${characterLabel} (${codePointLabel})`;
}

function isPrintableCharacter(character: string): boolean {
	return !/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(character);
}

function escapeCharacter(character: string): string {
	return Array.from(character)
		.map((c) => {
			const codePoint = c.codePointAt(0);
			if (codePoint === undefined) {
				return "";
			}
			return codePoint <= 0xffff
				? `\\u${codePoint.toString(16).toUpperCase().padStart(4, "0")}`
				: `\\u{${codePoint.toString(16).toUpperCase()}}`;
		})
		.join("");
}

export function throwFetchError(
	resource: string,
	response: FetchResult<unknown>,
	status: number,
	retryAfterMs?: number
): never {
	const errors = response.errors ?? [];
	for (const error of errors) {
		maybeThrowFriendlyError(error);
	}

	// Some API endpoints return non-standard error envelopes (e.g. {code, error}
	// instead of {errors: [...]}). Surface those as notes when errors is empty.
	const notes = [
		...errors.map((err) => ({ text: renderError(err) })),
		...(response.messages?.map((msg) => ({
			text: typeof msg === "string" ? msg : (msg.message ?? String(msg)),
		})) ?? []),
	];
	if (notes.length === 0) {
		const raw = response as unknown as Record<string, unknown>;
		const fallbackMessage =
			typeof raw.error === "string"
				? `${raw.error}${raw.code ? ` [code: ${raw.code}]` : ""}`
				: undefined;
		if (fallbackMessage) {
			notes.push({ text: fallbackMessage });
		}
	}
	if (retryAfterMs !== undefined) {
		notes.push({
			text: `The API responded with a "Retry-After" header indicating you should wait ${Math.ceil(retryAfterMs / 1000)} second(s) before retrying.`,
		});
	}

	const error = new APIError({
		text: `A request to the Cloudflare API (${resource}) failed.`,
		notes,
		status,
		// hoist the parsed `Retry-After` header (if any) so consumers such as
		// `retryOnAPIFailure()` can back off for the amount of time the API
		// asked us to wait, e.g. when rate limited (HTTP 429).
		retryAfterMs,
		telemetryMessage: false,
	});
	// add the first error code directly to this error
	// so consumers can use it for specific behaviour
	const code = errors[0]?.code;
	if (code) {
		error.code = code;
	}
	// hoist the first error's `meta` (if any) so consumers can inspect
	// endpoint-specific structured error payloads without re-parsing the body
	const meta = errors[0]?.meta;
	if (meta) {
		error.meta = meta;
	}
	// extract the account tag from the resource (if any)
	error.accountTag = extractAccountTag(resource);
	throw error;
}

function throwWAFBlockError(
	headers: Headers,
	method: string,
	resource: string,
	status: number,
	statusText: string,
	retryAfterMs?: number
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
		retryAfterMs,
		telemetryMessage: false,
	});
}

/**
 * Fetch a raw KV value from the Cloudflare API.
 *
 * This is special-cased because it's the only API endpoint that returns raw
 * binary data instead of a JSON envelope.
 *
 * Note: callers must call encodeURIComponent on `key` before passing it.
 */
export async function fetchKVGetValueBase(
	complianceConfig: ComplianceConfig,
	accountId: string,
	namespaceId: string,
	key: string,
	userAgent: string,
	logger: Logger,
	credentials: ApiCredentials
): Promise<ArrayBuffer> {
	const headers = new Headers();
	addAuthorizationHeader(headers, credentials);
	headers.set("User-Agent", userAgent);
	maybeAddTraceHeader(headers);

	const resource = `${getCloudflareApiBaseUrl(complianceConfig)}/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/values/${key}`;

	logger.debug(`-- START CF API REQUEST: GET ${resource}`);
	logger.debug("-- END CF API REQUEST");

	const response = await fetch(resource, {
		method: "GET",
		headers,
	});
	if (response.ok) {
		return await response.arrayBuffer();
	} else {
		throw new Error(
			`Failed to fetch ${resource} - ${response.status}: ${response.statusText}`
		);
	}
}

export type FetchKVGetValueFetcher = (
	complianceConfig: ComplianceConfig,
	accountId: string,
	namespaceId: string,
	key: string
) => Promise<ArrayBuffer>;

export function hasCursor(
	result_info: unknown
): result_info is { cursor: string } {
	const cursor = (result_info as { cursor: string } | undefined)?.cursor;
	return cursor !== undefined && cursor !== null && cursor !== "";
}

export function maybeAddTraceHeader(headers: Headers): void {
	const traceHeader = getTraceHeader();
	if (traceHeader) {
		headers.set("Cf-Trace-Id", traceHeader);
	}
}

function cloneHeaders(headers: HeadersInit | undefined): Headers {
	return new Headers(headers);
}
