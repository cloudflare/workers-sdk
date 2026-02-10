import { test } from "vitest";
import { runWorkerTest } from "../../test-shared";

test("Router: routes requests", async () => {
	await runWorkerTest("shared", "shared", "router.ts");
});
