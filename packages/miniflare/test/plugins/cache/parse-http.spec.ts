import { test } from "vitest";
import { runWorkerTest } from "../../test-shared";

test("parseHttpResponse: parses HTTP response messages", async () => {
	await runWorkerTest("cache", "cache", "parse-http.ts");
});
