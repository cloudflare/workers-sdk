import { describe, test } from "vitest";
import { getTextResponse } from "../../__test-utils__";

describe("in-worker defined durable objects", async () => {
	test("can bind to a Durable Object that does not extend the `DurableObject` class", async ({
		expect,
	}) => {
		expect(await getTextResponse("/legacy")).toEqual("Legacy Durable Object");
	});
	test("can bind and use a Durable Object defined in the worker", async ({
		expect,
	}) => {
		expect(await getTextResponse("/?name=my-do")).toEqual(
			"Durable Object 'my-do' count: 0"
		);
		expect(await getTextResponse("/increment?name=my-do")).toEqual(
			"Durable Object 'my-do' count: 1"
		);
		expect(await getTextResponse("/increment?name=my-do")).toEqual(
			"Durable Object 'my-do' count: 2"
		);
		expect(await getTextResponse("/decrement?name=my-do")).toEqual(
			"Durable Object 'my-do' count: 1"
		);
	});
});
