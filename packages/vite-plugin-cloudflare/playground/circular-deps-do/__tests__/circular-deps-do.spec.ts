import { describe, test } from "vitest";
import { getTextResponse } from "../../__test-utils__";

describe("worker with circular-dep package and durable objects", () => {
	test("worker starts and responds (circular dep does not crash startup)", async ({
		expect,
	}) => {
		const text = await getTextResponse("/");
		expect(text).toContain("sql type: function");
		expect(text).toContain("greeting:");
	});

	test("durable object works through circular-dep import", async ({
		expect,
	}) => {
		const text = await getTextResponse("/do");
		expect(text).toContain("Hello DO from A");
	});
});
