import { describe, expect, test } from "vitest";
import { getTextResponse } from "../../__test-utils__";

describe("in-worker defined durable objects constructor", async () => {
	test("block concurrency while in constructor run before RPC methods", async () => {
		expect(await getTextResponse("/?name=my-do")).toEqual(
			'Durable Object \'my-do\' ping: {"ping":"pong","initialized":true}'
		);
	});
});
