import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout } from "node:timers/promises";
import dedent from "ts-dedent";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { WranglerE2ETestHelper } from "./helpers/e2e-wrangler-test";
import { generateResourceName } from "./helpers/generate-resource-name";

describe("startWorker - remote bindings", () => {
	const remoteWorkerName = generateResourceName();
	const helper = new WranglerE2ETestHelper();

	beforeAll(async () => {
		await helper.seed(
			resolve(__dirname, "./seed-files/remote-binding-workers")
		);
		await helper.seed({
			"remote-worker.js": dedent/* javascript */ `
					export default {
						fetch() {
							return new Response('Hello from a remote worker (startWorker mixed-mode)');
						}
					};
			`,
		});
		await helper.run(
			`wrangler deploy remote-worker.js --name ${remoteWorkerName} --compatibility-date 2025-01-01`
		);
	}, 35_000);

	afterAll(async () => {
		await helper.run(`wrangler delete --name ${remoteWorkerName}`);
	});

	describe.each([true, false])(
		`with experimentalRemoteBindings %s`,
		(experimentalRemoteBindings) => {
			const testOpts: NonNullable<Parameters<typeof it>[1]> = {
				fails: !experimentalRemoteBindings,
				retry: !experimentalRemoteBindings ? 0 : undefined,
			};

			it("allows connecting to a remote worker", testOpts, async () => {
				await helper.seed({
					"wrangler.json": JSON.stringify({
						name: "mixed-mode-mixed-bindings-test",
						main: "simple-service-binding.js",
						compatibility_date: "2025-05-07",
						services: [
							{
								binding: "REMOTE_WORKER",
								service: remoteWorkerName,
								experimental_remote: true,
							},
						],
					}),
				});

				const { unstable_startWorker } = await helper.importWrangler();
				const worker = await unstable_startWorker({
					config: `${helper.tmpPath}/wrangler.json`,
					dev: {
						experimentalRemoteBindings,
					},
				});

				await worker.ready;

				await expect(
					(await worker.fetch("http://example.com")).text()
				).resolves.toContain(
					"REMOTE<WORKER>: Hello from a remote worker (startWorker mixed-mode)"
				);

				await worker.dispose();
			});

			it("handles code changes during development", testOpts, async () => {
				await helper.seed({
					"wrangler.json": JSON.stringify({
						name: "mixed-mode-mixed-bindings-test",
						main: "simple-service-binding.js",
						compatibility_date: "2025-05-07",
						services: [
							{
								binding: "REMOTE_WORKER",
								service: remoteWorkerName,
								experimental_remote: true,
							},
						],
					}),
				});

				const { unstable_startWorker } = await helper.importWrangler();

				const worker = await unstable_startWorker({
					config: `${helper.tmpPath}/wrangler.json`,
					dev: {
						experimentalRemoteBindings,
					},
				});

				await worker.ready;

				await expect(
					(await worker.fetch("http://example.com")).text()
				).resolves.toContain(
					"REMOTE<WORKER>: Hello from a remote worker (startWorker mixed-mode)"
				);

				const indexContent = await readFile(
					`${helper.tmpPath}/simple-service-binding.js`,
					"utf8"
				);
				await writeFile(
					`${helper.tmpPath}/simple-service-binding.js`,
					indexContent.replace(
						"REMOTE<WORKER>:",
						"The remote worker responded with:"
					),
					"utf8"
				);

				await setTimeout(500);

				await expect(
					(await worker.fetch("http://example.com")).text()
				).resolves.toContain(
					"The remote worker responded with: Hello from a remote worker (startWorker mixed-mode)"
				);

				await writeFile(
					`${helper.tmpPath}/simple-service-binding.js`,
					indexContent,
					"utf8"
				);

				await setTimeout(500);

				await expect(
					(await worker.fetch("http://example.com")).text()
				).resolves.toContain(
					"REMOTE<WORKER>: Hello from a remote worker (startWorker mixed-mode)"
				);

				await worker.dispose();
			});
		}
	);
});
