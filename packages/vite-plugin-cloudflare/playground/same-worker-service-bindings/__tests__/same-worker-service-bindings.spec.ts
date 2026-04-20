import { test } from "vitest";
import { getJsonResponse, getTextResponse } from "../../__test-utils__";

test("can bind to a Worker entrypoint that is defined as a plain object", async ({
	expect,
}) => {
	expect(await getTextResponse("/legacy")).toEqual("Legacy Worker entrypoint");
});

test("calls an RPC method on a named entrypoint in the same worker", async ({
	expect,
}) => {
	const result = await getJsonResponse();
	expect(result).toEqual({ result: 20 });
});
