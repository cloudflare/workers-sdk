import { instrument } from "@microlabs/otel-cf-workers";
import { Utils } from "discord-api-types/v10";
import dep from "ext-dep";
import mime from "mime-types";
import { assert, describe, test } from "vitest";
import sqlPlain from "../src/test.sql";
import sqlRaw from "../src/test.sql?raw";

describe("test", () => {
	test("resolves commonjs directory dependencies correctly", async () => {
		assert.equal(dep, 123);
	});

	// This requires the `deps.optimizer` option to be set in the vitest config
	test("resolves dependency without a default entrypoint", async () => {
		assert.isFunction(Utils.isDMInteraction);
	});

	// This requires the `deps.optimizer` option to be set in the vitest config
	test("resolves dependency with mapping on the browser field", async () => {
		assert.isFunction(instrument);
	});

	// Regression test for https://github.com/cloudflare/workers-sdk/issues/12049
	// Vite query parameters like ?raw should be handled by Vite, not module rules
	test("resolves file with ?raw query parameter", async () => {
		assert.equal(sqlRaw, sqlPlain);
	});

	// Verify CommonJS require() of JSON files works
	test("resolves dependency that requires JSON files", async () => {
		assert.equal(mime.lookup("test.html"), "text/html");
	});
});
