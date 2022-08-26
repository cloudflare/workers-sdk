global.fetch = require("jest-fetch-mock");

// @ts-expect-error this is a mock
// eslint-disable-next-line @typescript-eslint/no-var-requires
global.File = require("web-file-polyfill").File;
