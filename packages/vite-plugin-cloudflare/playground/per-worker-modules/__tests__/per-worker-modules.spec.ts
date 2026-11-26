import { describe, test } from "vitest";
import { getTextResponse } from "../../__test-utils__";

describe("per-Worker modules", () => {
	test("the entry Worker reads its own `env` through `this.env`", async ({
		expect,
	}) => {
		expect(await getTextResponse()).toBe("Hello from Worker A");
	});

	test("the entry Worker reads its own `env` through the module's `env`", async ({
		expect,
	}) => {
		expect(await getTextResponse("/module-env")).toBe("Hello from Worker A");
	});

	test("an auxiliary Worker reads its own `env`", async ({ expect }) => {
		expect(await getTextResponse("/worker-b")).toBe("Hello from Worker B");
	});
});
