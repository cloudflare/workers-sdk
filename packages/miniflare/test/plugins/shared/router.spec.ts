import { test } from "vitest";
import { runWorkerTest } from "../../test-shared";

test("Router: routes requests", async ({ expect }) => {
	await runWorkerTest(expect, "shared", "shared", "router.ts");
});
