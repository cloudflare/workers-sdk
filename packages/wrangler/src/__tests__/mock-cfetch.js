// This file mocks ../cfetch.ts
// so we can insert whatever responses we want from it

const { pathToRegexp } = require("path-to-regexp");
// TODO: add jsdoc style types here

// type MockHandler = (resource: string, init?: RequestInit) => any; // TODO: use a generic here

let mocks = [];

export function mockCfetch(resource, init) {
  for (const { regexp, method, handler } of mocks) {
    // The `resource` regular expression will extract the labelled groups from the URL.
    // Let's pass these through to the handler, to allow it to do additional checks or behaviour.
    const uri = regexp.exec(resource);
    // Does the resource path match and (if specified) the HTTP method?
    if (uri !== null && (!method || method === init.method)) {
      return handler(uri, init); // TODO: should we have some kind of fallthrough system? we'll see.
    }
  }
  throw new Error(`no mocks found for ${resource}`);
}

export function setMock(resource, methodOrHandler, handler = methodOrHandler) {
  const hasMethod = typeof methodOrHandler === "string";
  const mock = {
    resource,
    method: hasMethod ? methodOrHandler : undefined,
    handler: hasMethod ? handler : methodOrHandler,
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

export default mockCfetch;
