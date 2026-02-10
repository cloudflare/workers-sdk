import { describe, test } from "vitest";
import { getJsonResponse } from "../../../__test-utils__";

describe("zero-config mode (no wrangler config files)", async () => {
	test("entry worker returns a response", async ({ expect }) => {
		const result = await getJsonResponse();
		expect(result).toEqual({ name: "Worker C (no config file)" });
	});

	test("service binding fetch works", async ({ expect }) => {
		const result = await getJsonResponse("/fetch");
		expect(result).toEqual({ result: { name: "Worker D (no config file)" } });
	});

	test("RPC method works", async ({ expect }) => {
		const result = await getJsonResponse("/rpc-method");
		expect(result).toEqual({ result: 21 });
	});
});
