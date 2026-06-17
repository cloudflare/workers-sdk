import {
	addAuthorizationHeader,
	APIError,
	fetchInternalBase,
	fetchKVGetValueBase,
	getCloudflareApiBaseUrl,
	performApiFetchBase,
	UserError,
} from "@cloudflare/workers-utils";
import Cloudflare from "cloudflare";
import { fetch, FormData, Headers, Request, Response } from "undici";
import { version as wranglerVersion } from "../../package.json";
import { logger } from "../logger";
import { loginOrRefreshIfRequired, requireApiToken } from "../user";
import type {
	ApiCredentials,
	ComplianceConfig,
	Message,
} from "@cloudflare/workers-utils";
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
	apiToken = await resolveCredentials(complianceConfig, apiToken);
	return performApiFetchBase(
		complianceConfig,
		resource,
		init,
		`wrangler/${wranglerVersion}`,
		logger,
		queryParams,
		abortSignal,
		apiToken
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
	apiToken = await resolveCredentials(complianceConfig, apiToken);
	return fetchInternalBase(
		complianceConfig,
		resource,
		init,
		`wrangler/${wranglerVersion}`,
		logger,
		queryParams,
		abortSignal,
		apiToken
	);
}

function cloneHeaders(headers: HeadersInit | undefined): Headers {
	return new Headers(headers);
}

/**
 *
 * Triggers a login or token refresh if necessary
 */
export async function resolveCredentials(
	complianceConfig: ComplianceConfig,
	apiToken?: ApiCredentials
): Promise<ApiCredentials> {
	await requireLoggedIn(complianceConfig);
	return apiToken ?? requireApiToken();
}

/**
 * Maps authentication failure reasons to user-facing error message bodies.
 *
 * Each key corresponds to a specific failure scenario returned by
 * {@link loginOrRefreshIfRequired}, and the value is the descriptive message
 * included in the {@link UserError} thrown by {@link requireLoggedIn}.
 */
const requireLoggedInErrorMessageBodies = {
	"no-credentials-non-interactive": `Could not authenticate because no credentials were found and the environment is non-interactive. Set a CLOUDFLARE_API_TOKEN environment variable or run \`wrangler login\` in an interactive terminal first.`,
	"no-credentials-login-failed": `No credentials were found and the login attempt was unsuccessful. Run \`wrangler login\` to try again.`,
	"token-expired-non-interactive": `Your auth token has expired and could not be refreshed, and the environment is non-interactive. Run \`wrangler login\` in an interactive terminal or set a CLOUDFLARE_API_TOKEN.`,
	"token-expired-login-failed": `Your auth token has expired and could not be refreshed, and the login attempt was unsuccessful. Run \`wrangler login\` to try again.`,
} as const;

/**
 * Tip appended to authentication error messages, prompting the user to run
 * `wrangler whoami` to inspect their current login state.
 *
 * Used by {@link requireLoggedIn} when constructing the {@link UserError} message.
 */
const requireLoggedInErrorWhoAmITip =
	"\nRun `wrangler whoami` to check your current authentication status." as const;

/**
 * Ensures the user is logged in before making an API request.
 *
 * @param complianceConfig - Compliance region configuration
 * @throws {UserError} If the user could not be authenticated, with a message
 *   describing the specific reason for failure.
 */
export async function requireLoggedIn(
	complianceConfig: ComplianceConfig
): Promise<void> {
	const result = await loginOrRefreshIfRequired(complianceConfig);
	if (!result.loggedIn) {
		const errorMessageBody = requireLoggedInErrorMessageBodies[result.reason];
		const errorMessage = `Not logged in. ${errorMessageBody}${requireLoggedInErrorWhoAmITip}`;
		throw new UserError(errorMessage, {
			telemetryMessage: "cfetch auth login required",
		});
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
	const credentials = await resolveCredentials(complianceConfig);
	return fetchKVGetValueBase(
		complianceConfig,
		accountId,
		namespaceId,
		key,
		`wrangler/${wranglerVersion}`,
		logger,
		credentials
	);
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
			telemetryMessage: false,
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
