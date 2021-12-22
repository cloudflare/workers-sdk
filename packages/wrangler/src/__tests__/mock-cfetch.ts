// This file mocks ../cfetch.ts
// so we can insert whatever responses we want from it
import { pathToRegexp } from "path-to-regexp";

// Sadly we cannot give use the correct `RequestInit` type from node-fetch.
// Jest needs to transform the code as part of the module mocking, and it doesn't know how to cope with such types.
type RequestInit = { method: string; body: string };
type MockHandler = (uri: RegExpExecArray, init?: RequestInit) => unknown;
type MockFetch = {
  regexp: RegExp;
  method: string | undefined;
  handler: MockHandler;
};
type RemoveMockFn = () => void;

let mocks: MockFetch[] = [];

export default function mockCfetch(
  resource: string,
  init: RequestInit
): unknown {
  for (const { regexp, method, handler } of mocks) {
    const uri = regexp.exec(resource);
    // Do the resource path and (if specified) the HTTP method match?
    if (uri !== null && (!method || method === init.method)) {
      // The `resource` regular expression will extract the labelled groups from the URL.
      // These are passed through to the `handler` call, to allow it to do additional checks or behaviour.
      return handler(uri, init); // TODO: should we have some kind of fallthrough system? we'll see.
    }
  }
  throw new Error(`no mocks found for ${resource}`);
}

/**
 * Specify an expected resource path that is to be handled.
 */
export function setMock(
  resource: string,
  method: string,
  handler: MockHandler
): RemoveMockFn;
export function setMock(resource: string, handler: MockHandler): RemoveMockFn;
export function setMock(resource: string, ...args: unknown[]): RemoveMockFn {
  const handler = args.pop() as MockHandler;
  const method = args.pop() as string;
  const mock = {
    resource,
    method,
    handler,
    regexp: pathToRegexp(resource),
  };
  mocks.push(mock);
  return () => {
    mocks = mocks.filter((x) => x !== mock);
  };
}

export function unsetAllMocks() {
  mocks = [];
}

export const CF_API_BASE_URL =
  process.env.CF_API_BASE_URL || "https://api.cloudflare.com/client/v4";
