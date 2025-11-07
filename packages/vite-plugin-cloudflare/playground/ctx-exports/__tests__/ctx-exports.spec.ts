import { expect, test } from "vitest";
import { getTextResponse } from "../../__test-utils__";

test("can use `ctx.exports` to access a Worker Entrypoint", async () => {
	expect(await getTextResponse("/worker-entrypoint")).toBe(
		"Hello World from a Worker Entrypoint"
	);
});

test("can use `ctx.exports` to access a Durable Object", async () => {
	expect(await getTextResponse("/durable-object")).toBe(
		"Hello World from a Durable Object"
	);
});
