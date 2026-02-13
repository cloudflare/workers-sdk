import { describe, test } from "vitest";
import { getJsonResponse } from "../../../__test-utils__";

describe("config() option", async () => {
	test("entry worker receives vars from config function", async ({
		expect,
	}) => {
		const result = await getJsonResponse("/config-test");
		expect(result).toEqual({ configuredVar: "entry-worker-value" });
	});

	test("auxiliary worker receives vars from config object", async ({
		expect,
	}) => {
		const result = await getJsonResponse("/config-test/auxiliary");
		expect(result).toEqual({ configuredVar: "auxiliary-worker-value" });
	});

	test("entry worker basic functionality still works", async ({ expect }) => {
		const result = await getJsonResponse();
		expect(result).toEqual({ name: "Worker A" });
	});

	test("service bindings still work with config()", async ({ expect }) => {
		const result = await getJsonResponse("/fetch");
		expect(result).toEqual({ result: { name: "Worker B" } });
	});

	test("RPC still works with config()", async ({ expect }) => {
		const result = await getJsonResponse("/rpc-method");
		expect(result).toEqual({ result: 9 });
	});
});
