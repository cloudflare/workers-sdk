import { afterAll, beforeAll } from "vitest";

// Can be deleted once Node.js (where these tests run) version is bumped to one which includes this global :)

beforeAll(() => {
	// @ts-expect-error will go away once Node.js is bumped
	globalThis.crypto = require("crypto");
});

afterAll(() => {
	// @ts-expect-error will go away once Node.js is bumped
	delete globalThis.crypto;
});
