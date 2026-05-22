import { test } from "vitest";
import { getTextResponse, isBuild } from "../../__test-utils__";

test("serves the hello world response from a worker configured via worker.config.ts", async ({
	expect,
}) => {
	const response = await getTextResponse("/");
	expect(response).toBe(
		`The mode is ${isBuild ? "production" : "development"}`
	);
});
