import { test } from "vitest";
import { getTextResponse } from "../../__test-utils__";

test("can import module from child environment", async ({ expect }) => {
	const response = await getTextResponse();
	expect(response).toBe("Hello from the child environment");
});

test("can import additional module from child environment", async ({
	expect,
}) => {
	const response = await getTextResponse("/additional-module");
	expect(response).toBe("Hello from a child environment additional module\n");
});
