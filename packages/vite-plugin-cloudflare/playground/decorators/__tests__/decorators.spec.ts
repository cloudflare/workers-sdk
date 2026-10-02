import { describe, test } from "vitest";
import { getTextResponse } from "../../__test-utils__";

describe("standard decorators", () => {
	test("applies a method decorator to a Durable Object `fetch()` handler", async ({
		expect,
	}) => {
		expect(await getTextResponse("/fetch")).toBe("fetch tagged: true");
	});

	test("applies a wrapping method decorator to a Durable Object RPC method", async ({
		expect,
	}) => {
		expect(await getTextResponse("/rpc")).toBe("greet: hello world");
	});

	test("applies decorators in JavaScript modules", async ({ expect }) => {
		expect(await getTextResponse("/js")).toBe("format: HELLO");
	});

	test("applies class decorators", async ({ expect }) => {
		expect(await getTextResponse("/class")).toBe("Greeter");
	});

	test("applies decorators in pre-bundled dependencies", async ({ expect }) => {
		expect(await getTextResponse("/dependency")).toBe("HELLO!");
	});
});
