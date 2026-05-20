import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout } from "node:timers/promises";
import { beforeAll, describe, it, onTestFinished } from "vitest";
import { CLOUDFLARE_ACCOUNT_ID } from "../helpers/account-id";
import {
	importWrangler,
	WranglerE2ETestHelper,
} from "../helpers/e2e-wrangler-test";

const { createServer } = await importWrangler();

describe.skipIf(!CLOUDFLARE_ACCOUNT_ID)(
	"createServer - remote bindings",
	() => {
		const remoteWorkerName = "preserve-e2e-wrangler-remote-worker";
		const helper = new WranglerE2ETestHelper();

		beforeAll(async () => {
			await helper.seed(resolve(__dirname, "./workers"));
			await helper.ensureWorkerDeployed({
				entryPoint: "remote-worker.js",
				workerName: remoteWorkerName,
			});
		}, 60_000);

		it("allows connecting to a remote worker", async ({ expect }) => {
			await helper.seed({
				"wrangler.json": JSON.stringify({
					name: "remote-bindings-test",
					main: "simple-service-binding.js",
					compatibility_date: "2025-05-07",
					services: [
						{
							binding: "REMOTE_WORKER",
							service: remoteWorkerName,
							remote: true,
						},
					],
				}),
			});

			const server = createServer({
				root: helper.tmpPath,
				workers: [{ configPath: "wrangler.json" }],
				allowRemoteBindings: true,
			});
			onTestFinished(server.close);

			await server.listen();

			await expect(
				(await server.fetch("http://example.com")).text()
			).resolves.toContain("REMOTE<WORKER>: Hello from a remote worker");
		});

		it("handles code changes during development", async ({ expect }) => {
			await helper.seed({
				"wrangler.json": JSON.stringify({
					name: "remote-bindings-test",
					main: "simple-service-binding.js",
					compatibility_date: "2025-05-07",
					services: [
						{
							binding: "REMOTE_WORKER",
							service: remoteWorkerName,
							remote: true,
						},
					],
				}),
			});

			const server = createServer({
				root: helper.tmpPath,
				workers: [{ configPath: "wrangler.json" }],
				allowRemoteBindings: true,
				watch: true,
			});
			onTestFinished(server.close);

			await server.listen();

			await expect(
				(await server.fetch("http://example.com")).text()
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
				(await server.fetch("http://example.com")).text()
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
				(await server.fetch("http://example.com")).text()
			).resolves.toContain("REMOTE<WORKER>: Hello from a remote worker");
		});
	}
);

it("doesn't connect to remote bindings by default", async ({ expect }) => {
	const helper = new WranglerE2ETestHelper();
	await helper.seed(resolve(__dirname, "./workers"));
	await helper.seed({
		"wrangler.json": JSON.stringify({
			name: "remote-bindings-test",
			main: "ai.js",
			compatibility_date: "2025-05-07",
			ai: {
				binding: "AI",
				remote: true,
			},
		}),
	});

	await expect(async () => {
		const server = createServer({
			root: helper.tmpPath,
			workers: [{ configPath: "wrangler.json" }],
		});
		onTestFinished(server.close);

		await server.listen();

		await server.fetch("http://example.com");
	}).rejects.toThrowErrorMatchingInlineSnapshot(
		`[Error: Binding AI needs to be run remotely]`
	);
});
