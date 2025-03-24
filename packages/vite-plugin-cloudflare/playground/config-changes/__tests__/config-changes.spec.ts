import * as fs from "node:fs";
import * as path from "node:path";
import { expect, test, vi } from "vitest";
import { getTextResponse } from "../../__test-utils__";

test("restart", async ({ onTestFinished }) => {
	const workerConfigPath = path.join(__dirname, "../wrangler.json");
	const originalWorkerConfig = fs.readFileSync(workerConfigPath, "utf-8");
	onTestFinished(() => {
		fs.writeFileSync(workerConfigPath, originalWorkerConfig);
	});
	const originalResponse = await getTextResponse();
	expect(originalResponse).toBe('The value of MY_VAR is "one"');

	const newWorkerConfig = JSON.stringify({
		...JSON.parse(originalWorkerConfig),
		vars: {
			MY_VAR: "two",
		},
	});
	fs.writeFileSync(workerConfigPath, newWorkerConfig);

	await vi.waitFor(async () => {
		const newResponse = await getTextResponse();
		expect(newResponse).toBe('The value of MY_VAR is "two"');
	});
});
