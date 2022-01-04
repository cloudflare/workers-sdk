import type { RequestInit } from "node-fetch";
import type { URLSearchParams } from "node:url";
import { pathToRegexp } from "path-to-regexp";
import { CF_API_BASE_URL } from "../cfetch";
import type { FetchResult } from "../cfetch";

/**
 * The signature of the function that will handle a mock request.
 */
export type MockHandler<ResponseType> = (
  uri: RegExpExecArray,
  init?: RequestInit,
  queryParams?: URLSearchParams
) => ResponseType;

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
  queryParams?: URLSearchParams
) {
  for (const { regexp, method, handler } of mocks) {
    const resourcePath = new URL(resource, CF_API_BASE_URL).pathname;
    const uri = regexp.exec(resourcePath);
    // Do the resource path and (if specified) the HTTP method match?
    if (uri !== null && (!method || method === init.method)) {
      // The `resource` regular expression will extract the labelled groups from the URL.
      // These are passed through to the `handler` call, to allow it to do additional checks or behaviour.
      return handler(uri, init, queryParams); // TODO: should we have some kind of fallthrough system? we'll see.
    }
  }
  throw new Error(`no mocks found for ${init.method}: ${resource}`);
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
export function createFetchResult<ResponseType>(
  result: ResponseType,
  success = true,
  errors = [],
  messages = [],
  result_info?: unknown
): FetchResult<ResponseType> {
  return result_info
    ? {
        result,
        success,
        errors,
        messages,
        result_info,
      }
    : {
        result,
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
