import { test } from "vitest";
import { getTextResponse, isBuild } from "../../__test-utils__";

test("serves the correct response for a worker configured via cloudflare.config.ts", async ({
	expect,
}) => {
	const response = await getTextResponse("/");
	expect(response).toBe(
		`The mode is ${isBuild ? "production" : "development"}`
	);
});

test("serves an auxiliary Worker configured via a TypeScript config", async ({
	expect,
}) => {
	const response = await getTextResponse("/auxiliary");
	expect(response).toBe("Hello from the auxiliary Worker");
});
