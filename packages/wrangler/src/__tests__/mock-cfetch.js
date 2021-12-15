// This file mocks ../cfetch.ts
// so we can insert whatever responses we want from it

const { pathToRegexp } = require("path-to-regexp");
// TODO: add jsdoc style types here

// type MockHandler = (resource: string, init?: RequestInit) => any; // TODO: use a generic here

let mocks = [];

function mockCfetch(resource, init) {
  for (const { regexp, handler } of mocks) {
    if (regexp.test(resource)) {
      return handler(resource, init); // should we have some kind of fallthrough system? we'll see.
    }
  }
  throw new Error(`no mocks found for ${resource}`);
}

function setMock(resource, handler) {
  const mock = {
    resource,
    handler,
    regexp: pathToRegexp(resource),
  };
  mocks.push(mock);
  return () => {
    mocks = mocks.filter((x) => x !== mock);
  };
}

function unsetAllMocks() {
  mocks = [];
}

const CF_API_BASE_URL =
  process.env.CF_API_BASE_URL || "https://api.cloudflare.com/client/v4";

Object.assign(module.exports, {
  __esModule: true,
  default: mockCfetch,
  mockCfetch,
  setMock,
  unsetAllMocks,
  CF_API_BASE_URL,
});
