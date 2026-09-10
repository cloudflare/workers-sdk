import { describe, test } from "vitest";
import {
	getJsonResponse,
	getTextResponse,
	isBuild,
} from "../../__test-utils__";

describe("in-worker defined durable objects", async () => {
	test("can bind to a Durable Object that does not extend the `DurableObject` class", async ({
		expect,
	}) => {
		expect(await getTextResponse("/legacy")).toEqual("Legacy Durable Object");
	});
	test("can bind and use a Durable Object defined in the worker", async ({
		expect,
	}) => {
		const name = `my-do-${crypto.randomUUID()}`;

		expect(await getTextResponse(`/?name=${name}`)).toEqual(
			`Durable Object '${name}' count: 0`
		);
		expect(await getTextResponse(`/increment?name=${name}`)).toEqual(
			`Durable Object '${name}' count: 1`
		);
		expect(await getTextResponse(`/increment?name=${name}`)).toEqual(
			`Durable Object '${name}' count: 2`
		);
		expect(await getTextResponse(`/decrement?name=${name}`)).toEqual(
			`Durable Object '${name}' count: 1`
		);
	});
	test.skipIf(isBuild)(
		"preserves same-type RPC call order in the dev runner",
		async ({ expect }) => {
			const result = await getJsonResponse(
				`/rpc-ordering?name=${crypto.randomUUID()}`
			);

			expect(result).toMatchObject({ inOrder: true });
		}
	);
});
