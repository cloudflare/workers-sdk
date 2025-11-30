import { describe, expect, test } from "vitest";
import { getJsonResponse } from "../../../__test-utils__";

describe("configure() option", async () => {
	test("entry worker receives vars from configure function", async () => {
		const result = await getJsonResponse("/config-test");
		expect(result).toEqual({ configuredVar: "entry-worker-value" });
	});

	test("auxiliary worker receives vars from configure object", async () => {
		const result = await getJsonResponse("/config-test/auxiliary");
		expect(result).toEqual({ configuredVar: "auxiliary-worker-value" });
	});

	test("entry worker basic functionality still works", async () => {
		const result = await getJsonResponse();
		expect(result).toEqual({ name: "Worker A" });
	});

	test("service bindings still work with configure()", async () => {
		const result = await getJsonResponse("/fetch");
		expect(result).toEqual({ result: { name: "Worker B" } });
	});

	test("RPC still works with configure()", async () => {
		const result = await getJsonResponse("/rpc-method");
		expect(result).toEqual({ result: 9 });
	});
});
