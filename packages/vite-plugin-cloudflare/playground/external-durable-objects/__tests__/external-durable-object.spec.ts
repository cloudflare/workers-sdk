import { describe, test } from "vitest";
import { getTextResponse } from "../../__test-utils__";

describe("external durable objects", async () => {
	test("can use `scriptName` to bind to a Durable Object defined in another Worker", async ({
		expect,
	}) => {
		expect(await getTextResponse("/?name=my-do")).toEqual(
			'From worker-a: {"name":"my-do","count":0}'
		);
		expect(await getTextResponse("/increment?name=my-do")).toEqual(
			'From worker-a: {"name":"my-do","count":1}'
		);
		expect(await getTextResponse("/increment?name=my-do")).toEqual(
			'From worker-a: {"name":"my-do","count":2}'
		);
		expect(await getTextResponse("/?name=my-do")).toEqual(
			'From worker-a: {"name":"my-do","count":2}'
		);
	});
});
