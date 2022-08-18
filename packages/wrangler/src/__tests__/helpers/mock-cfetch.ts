import { Readable } from "node:stream";
import { URL, URLSearchParams } from "node:url";
import { pathToRegexp } from "path-to-regexp";
import { getCloudflareApiBaseUrl } from "../../cfetch";
import type { FetchResult, FetchError } from "../../cfetch";
import type { fetchInternal, fetchR2Objects } from "../../cfetch/internal";
import type { RequestInit, BodyInit, HeadersInit } from "undici";

const {
	fetchInternal: realFetchInternal,
}: { fetchInternal: typeof fetchInternal } = jest.requireActual(
	"../../cfetch/internal"
);
const {
	fetchR2Objects: realFetchR2Objects,
}: { fetchR2Objects: typeof fetchR2Objects } = jest.requireActual(
	"../../cfetch/internal"
);

/**
 * The signature of the function that will handle a mock request.
 */
export type MockHandler<ResponseType> = (
	uri: RegExpExecArray,
	init: RequestInit,
	queryParams: URLSearchParams
) => ResponseType | Promise<ResponseType>;

type RemoveMockFn = () => void;

interface MockFetch<ResponseType> {
	regexp: RegExp;
	method: string | undefined;
	handler: MockHandler<ResponseType>;
}
const mocks: MockFetch<unknown>[] = [];

/**
 * The mock implementation of `cfApi.fetch()`.
 *
 * This function will attempt to match the given request to one of the mock handlers configured by calls to `setMock`.
 *
 * Once found the handler will be used to generate a mock response.
 */
export async function mockFetchInternal(
	resource: string,
	init: RequestInit = {},
	queryParams: URLSearchParams | undefined = undefined
) {
	for (const { regexp, method, handler } of mocks) {
		const resourcePath = new URL(resource, getCloudflareApiBaseUrl()).pathname;
		const uri = regexp.exec(resourcePath);
		// Do the resource path and (if specified) the HTTP method match?
		if (uri !== null && (!method || method === (init.method ?? "GET"))) {
			// The `resource` regular expression will extract the labelled groups from the URL.
			// These are passed through to the `handler` call, to allow it to do additional checks or behaviour.
			return await handler(uri, init, (queryParams = new URLSearchParams()));
		}
	}

	// no mocks found for ${init.method ?? "any HTTP"} request to ${resource}
	// let it fall through to mock-service-worker
	// (do a real, unmocked fetch)

	return await realFetchInternal(resource, init, queryParams);
}

/**
 * Specify an expected resource path that is to be handled, resulting in a raw JSON response.
 *
 * @param resource The path of the resource to be matched.
 * This can include wildcards whose value will be passed to the `handler`.
 * @param handler The function that will generate the mock response for this request.
 */
export function setMockRawResponse<ResponseType>(
	resource: string,
	handler: MockHandler<ResponseType>
): RemoveMockFn;
/**
 * Specify an expected resource path that is to be handled, resulting in a raw JSON response.
 *
 * @param resource The path of the resource to be matched.
 * This can include wildcards whose value will be passed to the `handler`.
 * @param method The HTTP method (e.g. GET, POST, etc) that the request must have to match this mock handler.
 * @param handler The function that will generate the mock response for this request.
 */
export function setMockRawResponse<ResponseType>(
	resource: string,
	method: string,
	handler: MockHandler<ResponseType>
): RemoveMockFn;
/**
 * Specify an expected resource path that is to be handled, resulting in a raw JSON response.
 */
export function setMockRawResponse<ResponseType>(
	resource: string,
	...args: [string, MockHandler<ResponseType>] | [MockHandler<ResponseType>]
): RemoveMockFn {
	const handler = args.pop() as MockHandler<ResponseType>;
	const method = args.pop() as string;
	const mock = {
		resource,
		method,
		handler,
		regexp: pathToRegexp(resource),
	};
	mocks.push(mock);
	return () => {
		const mockIndex = mocks.indexOf(mock);
		if (mockIndex !== -1) {
			mocks.splice(mockIndex, 1);
		}
	};
}

/**
 * Specify an expected resource path that is to be handled, resulting in a `FetchRequest`.
 *
 * The mock `handler` should return the `result`, which will then be wrapped in a `FetchRequest` object.
 *
 * @param resource The path of the resource to be matched.
 * This can include wildcards whose value will be passed to the `handler`.
 * @param handler The function that will generate the mock response for this request.
 */
export function setMockResponse<ResponseType>(
	resource: string,
	handler: MockHandler<ResponseType>
): RemoveMockFn;
/**
 * Specify an expected resource path that is to be handled, resulting in a FetchRequest..
 *
 * @param resource The path of the resource to be matched.
 * This can include wildcards whose value will be passed to the `handler`.
 * @param method The HTTP method (e.g. GET, POST, etc) that the request must have to match this mock handler.
 * @param handler The function that will generate the mock response for this request.
 */
export function setMockResponse<ResponseType>(
	resource: string,
	method: string,
	handler: MockHandler<ResponseType>
): RemoveMockFn;
/**
 * Specify an expected resource path that is to be handled, resulting in a FetchRequest.
 */
export function setMockResponse<ResponseType>(
	resource: string,
	...args: [string, MockHandler<ResponseType>] | [MockHandler<ResponseType>]
): RemoveMockFn {
	const handler = args.pop() as MockHandler<ResponseType>;
	const method = args.pop() as string;
	return setMockRawResponse(resource, method, (...handlerArgs) =>
		createFetchResult(handler(...handlerArgs))
	);
}

/**
 * A helper to make it easier to create `FetchResult` objects in tests.
 */
export async function createFetchResult<ResponseType>(
	result: ResponseType | Promise<ResponseType>,
	success = true,
	errors: FetchError[] = [],
	messages: string[] = [],
	result_info?: unknown
): Promise<FetchResult<ResponseType>> {
	return result_info
		? {
				result: await result,
				success,
				errors,
				messages,
				result_info,
		  }
		: {
				result: await result,
				success,
				errors,
				messages,
		  };
}

/**
 * Remove all the configured mock handlers.
 *
 * This should be called in an `afterEach()` block to ensure that mock handlers do not leak between tests.
 */
export function unsetAllMocks() {
	mocks.length = 0;
}

/**
 * We special-case fetching the request for `kv:key get`, because it's
 * the only cloudflare API endpoint that returns a plain string as the
 * value, and not as the "standard" FetchResult-style json. Hence, we also
 * special-case mocking it here.
 */

const kvGetMocks = new Map<string, string | Buffer>();
const r2GetMocks = new Map<string, string | undefined>();
const dashScriptMocks = new Map<string, string | undefined>();

/**
 * @mocked typeof fetchKVGetValue
 */
export function mockFetchKVGetValue(
	accountId: string,
	namespaceId: string,
	key: string
) {
	const mapKey = `${accountId}/${namespaceId}/${key}`;
	if (kvGetMocks.has(mapKey)) {
		const value = kvGetMocks.get(mapKey);
		if (value !== undefined) return Promise.resolve(value);
	}
	throw new Error(`no mock value found for \`kv:key get\` - ${mapKey}`);
}

export function setMockFetchKVGetValue(
	accountId: string,
	namespaceId: string,
	key: string,
	value: string | Buffer
) {
	kvGetMocks.set(`${accountId}/${namespaceId}/${key}`, value);
}

// Temporary fallthrough for mocks so other internals can remained mocked
export async function mockFetchR2Objects(
	resource: string,
	bodyInit: {
		body: BodyInit | Readable;
		headers: HeadersInit | undefined;
		method: "PUT" | "GET" | "DELETE";
	}
) {
	// no mocks found for ${init.method ?? "any HTTP"} request to ${resource}
	// let it fall through to mock-service-worker
	// (do a real, unmocked fetch)

	return await realFetchR2Objects(resource, bodyInit);
}

export function unsetSpecialMockFns() {
	kvGetMocks.clear();
	dashScriptMocks.clear();
}

/**
 * @mocked typeof fetchDashScript
 * multipart/form-data is the response for modules and raw text for the Script endpoint.
 */
export async function mockFetchDashScript(resource: string): Promise<string> {
	if (dashScriptMocks.has(resource)) {
		const value = dashScriptMocks.get(resource) ?? "";

		return value;
	}
	throw new Error(`no mock found for \`init from-dash\` - ${resource}`);
}

/**
 * Mock setter for usage within test blocks, companion helper to `mockFetchDashScript`
 */
export function setMockFetchDashScript({
	accountId,
	fromDashScriptName,
	mockResponse,
}: {
	accountId: string;
	fromDashScriptName: string;
	mockResponse?: string;
}) {
	dashScriptMocks.set(
		`/accounts/${accountId}/workers/scripts/${fromDashScriptName}`,
		mockResponse
	);
}
