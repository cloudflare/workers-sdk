import { test } from "vitest";
import { getTextResponse } from "../../__test-utils__";

test("serves the hello world response from a worker configured via worker.config.ts", async ({
	expect,
}) => {
	const response = await getTextResponse("/");
	expect(response).toBe("Hello from worker.config.ts");
});
