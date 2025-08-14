import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout } from "node:timers/promises";
import { beforeAll, describe, expect, it } from "vitest";
import { CLOUDFLARE_ACCOUNT_ID } from "../helpers/account-id";
import { WranglerE2ETestHelper } from "../helpers/e2e-wrangler-test";
import { generateResourceName } from "../helpers/generate-resource-name";

describe.skipIf(!CLOUDFLARE_ACCOUNT_ID)("startWorker - remote bindings", () => {
	const remoteWorkerName = generateResourceName();
	const helper = new WranglerE2ETestHelper();

	beforeAll(async () => {
		await helper.seed(resolve(__dirname, "./workers"));
		const { cleanup } = await helper.worker({
			entryPoint: "remote-worker.js",
			workerName: remoteWorkerName,
		});
		return cleanup;
	}, 35_000);

	describe.each([
		{ experimentalRemoteBindings: true },
		{ experimentalRemoteBindings: false },
	])(
		`with experimentalRemoteBindings = $experimentalRemoteBindings`,
		({ experimentalRemoteBindings }) => {
			const testOpts: NonNullable<Parameters<typeof it>[1]> = {
				fails: !experimentalRemoteBindings,
				retry: !experimentalRemoteBindings ? 0 : undefined,
			};

			it("allows connecting to a remote worker", testOpts, async () => {
				await helper.seed({
					"wrangler.json": JSON.stringify({
						name: "remote-bindings-test",
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
						inspector: false,
						server: { port: 0 },
					},
				});

				await worker.ready;

				await expect(
					(await worker.fetch("http://example.com")).text()
				).resolves.toContain("REMOTE<WORKER>: Hello from a remote worker");

				await worker.dispose();
			});

			it("handles code changes during development", testOpts, async () => {
				await helper.seed({
					"wrangler.json": JSON.stringify({
						name: "remote-bindings-test",
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
						inspector: false,
						server: { port: 0 },
					},
				});

				await worker.ready;

				await expect(
					(await worker.fetch("http://example.com")).text()
				).resolves.toContain("REMOTE<WORKER>: Hello from a remote worker");

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
					"The remote worker responded with: Hello from a remote worker"
				);

				await writeFile(
					`${helper.tmpPath}/simple-service-binding.js`,
					indexContent,
					"utf8"
				);

				await setTimeout(500);

				await expect(
					(await worker.fetch("http://example.com")).text()
				).resolves.toContain("REMOTE<WORKER>: Hello from a remote worker");

				await worker.dispose();
			});
		}
	);
});
