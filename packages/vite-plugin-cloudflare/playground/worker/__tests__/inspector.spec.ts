import { expect, test } from "vitest";

test("starts a devTools inspector server on inspectorPort 9123", async () => {
	const inspectorJsonResponse = await fetch("http://localhost:9123/json");
	const jsonResponse = (await inspectorJsonResponse.json()) as Record<
		string,
		string
	>[];

	expect(Array.isArray(jsonResponse)).toBe(true);
	expect(
		jsonResponse.every((item) =>
			item["webSocketDebuggerUrl"]?.startsWith("ws://localhost:9123/")
		)
	);
});
