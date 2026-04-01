import { test } from "vitest";
import { runWorkerTest } from "../../test-shared";

test("parseHttpResponse: parses HTTP response messages", async ({ expect }) => {
	await runWorkerTest(expect, "cache", "cache", "parse-http.ts");
});
