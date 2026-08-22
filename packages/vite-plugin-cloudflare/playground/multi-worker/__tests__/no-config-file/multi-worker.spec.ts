import { describe, test } from "vitest";
import { getJsonResponse, isBuild } from "../../../__test-utils__";

describe("inline auxiliary Worker config", async () => {
	test("entry worker returns a response", async ({ expect }) => {
		const result = await getJsonResponse();
		expect(result).toEqual({ name: "Worker C (no config file)" });
	});

	// TODO: Reinstate build/preview coverage when auxiliary Workers are supported by Build Output.
	test.skipIf(isBuild)("service binding fetch works", async ({ expect }) => {
		const result = await getJsonResponse("/fetch");
		expect(result).toEqual({ result: { name: "Worker D (no config file)" } });
	});

	test.skipIf(isBuild)("RPC method works", async ({ expect }) => {
		const result = await getJsonResponse("/rpc-method");
		expect(result).toEqual({ result: 21 });
	});
});
