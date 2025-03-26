import * as fs from "node:fs";
import * as path from "node:path";
import { expect, test, vi } from "vitest";
import { getTextResponse, isBuild, serverLogs } from "../../__test-utils__";

test.runIf(!isBuild)(
	"successfully updates when a var is updated in the Worker config",
	async ({ onTestFinished }) => {
		const workerConfigPath = path.join(__dirname, "../wrangler.json");
		const originalWorkerConfig = fs.readFileSync(workerConfigPath, "utf-8");

		onTestFinished(async () => {
			fs.writeFileSync(workerConfigPath, originalWorkerConfig);
			// We need to ensure that the original config is restored before the next test runs
			await vi.waitFor(
				async () => {
					const revertedResponse = await getTextResponse();
					expect(revertedResponse).toBe('The value of MY_VAR is "one"');
				},
				{ timeout: 5000 }
			);
		});

		const originalResponse = await getTextResponse();
		expect(originalResponse).toBe('The value of MY_VAR is "one"');

		const updatedWorkerConfig = JSON.stringify({
			...JSON.parse(originalWorkerConfig),
			vars: {
				MY_VAR: "two",
			},
		});
		fs.writeFileSync(workerConfigPath, updatedWorkerConfig);
		await vi.waitFor(
			async () => {
				const updatedResponse = await getTextResponse();
				expect(updatedResponse).toBe('The value of MY_VAR is "two"');
			},
			{ timeout: 5000 }
		);
	}
);

test.runIf(!isBuild)(
	"reports errors in updates to the Worker config",
	async ({ onTestFinished }) => {
		const workerConfigPath = path.join(__dirname, "../wrangler.json");
		const originalWorkerConfig = fs.readFileSync(workerConfigPath, "utf-8");

		onTestFinished(async () => {
			fs.writeFileSync(workerConfigPath, originalWorkerConfig);
			// We need to ensure that the original config is restored before the next test runs
			await vi.waitFor(
				async () => {
					const revertedResponse = await getTextResponse();
					expect(revertedResponse).toBe('The value of MY_VAR is "one"');
				},
				{ timeout: 5000 }
			);
		});

		const originalResponse = await getTextResponse();
		expect(originalResponse).toBe('The value of MY_VAR is "one"');

		const updatedWorkerConfig = JSON.stringify({
			...JSON.parse(originalWorkerConfig),
			main: "./src/non-existing-file.ts",
			vars: {
				MY_VAR: "two",
			},
		});
		fs.writeFileSync(workerConfigPath, updatedWorkerConfig);
		await vi.waitFor(
			async () => {
				const newResponse = await getTextResponse();
				expect(serverLogs.errors.join()).toMatch(
					/.*The provided Wrangler config main field .+? doesn't point to an existing file.*/
				);
				expect(newResponse).toBe('The value of MY_VAR is "one"');
			},
			{ timeout: 5000 }
		);
	}
);
