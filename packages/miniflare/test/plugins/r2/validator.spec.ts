import { test } from "vitest";
import { runWorkerTest } from "../../test-shared";

test("testR2Conditional: matches various conditions", async ({ expect }) => {
	await runWorkerTest(expect, "r2", "r2", "validator.ts");
});
