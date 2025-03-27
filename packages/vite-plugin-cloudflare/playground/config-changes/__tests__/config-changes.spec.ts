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
			await waitForUpdate(async () => {
				const revertedResponse = await getTextResponse();
				expect(revertedResponse).toMatch(/The value of MY_VAR is "one"/);
			});
		});

		const originalResponse = await getTextResponse();
		expect(originalResponse).toMatch(/The value of MY_VAR is "one"/);

		const updatedWorkerConfig = JSON.stringify({
			...JSON.parse(originalWorkerConfig),
			vars: {
				MY_VAR: "two",
			},
		});
		fs.writeFileSync(workerConfigPath, updatedWorkerConfig);
		await waitForUpdate(async () => {
			const updatedResponse = await getTextResponse();
			expect(updatedResponse).toMatch(/The value of MY_VAR is "two"/);
		});
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
			await waitForUpdate(async () => {
				const revertedResponse = await getTextResponse();
				expect(revertedResponse).toMatch(/The value of MY_VAR is "one"/);
			});
		});

		const originalResponse = await getTextResponse();
		expect(originalResponse).toMatch(/The value of MY_VAR is "one"/);

		const updatedWorkerConfig = JSON.stringify({
			...JSON.parse(originalWorkerConfig),
			main: "./src/non-existing-file.ts",
			vars: {
				MY_VAR: "two",
			},
		});
		fs.writeFileSync(workerConfigPath, updatedWorkerConfig);
		await waitForUpdate(async () => {
			const newResponse = await getTextResponse();
			expect(serverLogs.errors.join()).toMatch(
				/.*The provided Wrangler config main field .+? doesn't point to an existing file.*/
			);
			expect(newResponse).toMatch(/The value of MY_VAR is "one"/);
		});
	}
);

test.runIf(!isBuild)(
	"successfully updates when a var is updated in a .dev.vars file",
	async ({ onTestFinished }) => {
		const dotDevDotVarsFilePath = path.join(__dirname, "../.dev.vars");
		const originalDotDevDotVars = fs.readFileSync(
			dotDevDotVarsFilePath,
			"utf-8"
		);

		onTestFinished(async () => {
			fs.writeFileSync(dotDevDotVarsFilePath, originalDotDevDotVars);
			// We need to ensure that the original config is restored before the next test runs
			await waitForUpdate(async () => {
				const revertedResponse = await getTextResponse();
				expect(revertedResponse).toMatch(
					/the value of MY_SECRET is "secret A"/
				);
			});
		});

		const originalResponse = await getTextResponse();
		expect(originalResponse).toMatch(/the value of MY_SECRET is "secret A"/);

		fs.writeFileSync(dotDevDotVarsFilePath, 'MY_SECRET = "secret B"\n');
		await waitForUpdate(async () => {
			const updatedResponse = await getTextResponse();
			expect(updatedResponse).toMatch(/the value of MY_SECRET is "secret B"/);
		});
	}
);

async function waitForUpdate(callback: () => Promise<void>) {
	await vi.waitFor(callback, {
		// let's give a generous timeout here as this
		// has shown some signs of flakiness in CI
		timeout: 10000,
		// let's space out the requests, not to
		// spam the server
		interval: 500,
	});
}
