import { fork } from "child_process";
import { setTimeout } from "node:timers/promises";
import * as path from "path";
import { fetch } from "undici";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { unstable_dev } from "wrangler";
import type { ChildProcess } from "child_process";
import type { Response } from "undici";
import type { UnstableDevWorker } from "wrangler";

const waitUntilReady = async (url: string): Promise<Response> => {
	let response: Response | undefined = undefined;

	while (response === undefined) {
		await setTimeout(500);

		try {
			response = await fetch(url);
		} catch (e) {}
	}

	return response as Response;
};

type WranglerInstance = {
	dirName: string;
	childProcess: ChildProcess;
	ip: string;
	port: string;
};

describe("Pages Functions", () => {
	let wranglerInstances: (WranglerInstance | UnstableDevWorker)[] = [];
	let pagesAppPort: string;

	beforeAll(async () => {
		wranglerInstances[0] = await unstable_dev(
			path.join(__dirname, "../module-worker-a/index.ts"),
			{
				config: path.join(__dirname, "../module-worker-a/wrangler.toml"),
				experimental: {
					fileBasedRegistry: true,
					disableExperimentalWarning: true,
					devEnv: true,
				},
			}
		);
		await setTimeout(1000);

		wranglerInstances[1] = await unstable_dev(
			path.join(__dirname, "../module-worker-b/index.ts"),
			{
				config: path.join(__dirname, "../module-worker-b/wrangler.toml"),
				experimental: {
					fileBasedRegistry: true,
					disableExperimentalWarning: true,
					devEnv: true,
				},
			}
		);
		await setTimeout(1000);

		wranglerInstances[2] = await unstable_dev(
			path.join(__dirname, "../service-worker-a/index.ts"),
			{
				config: path.join(__dirname, "../service-worker-a/wrangler.toml"),
				experimental: {
					fileBasedRegistry: true,
					disableExperimentalWarning: true,
					devEnv: true,
				},
			}
		);
		await setTimeout(1000);

		wranglerInstances[3] = await unstable_dev(
			path.join(__dirname, "../module-worker-c/index.ts"),
			{
				config: path.join(__dirname, "../module-worker-c/wrangler.toml"),
				env: "staging",
				experimental: {
					fileBasedRegistry: true,
					disableExperimentalWarning: true,
					devEnv: true,
				},
			}
		);
		await setTimeout(1000);

		wranglerInstances[4] = await unstable_dev(
			path.join(__dirname, "../module-worker-d/index.ts"),
			{
				config: path.join(__dirname, "../module-worker-d/wrangler.toml"),
				env: "production",
				experimental: {
					fileBasedRegistry: true,
					disableExperimentalWarning: true,
					devEnv: true,
				},
			}
		);
		await setTimeout(1000);

		wranglerInstances[5] = await getWranglerInstance({
			pages: true,
			dirName: "pages-functions-app",
			extraArgs: [
				"--service=MODULE_A_SERVICE=module-worker-a",
				"--service=MODULE_B_SERVICE=module-worker-b",
				"--service=SERVICE_A_SERVICE=service-worker-a",
				"--service=STAGING_MODULE_C_SERVICE=module-worker-c@staging",
				"--service=STAGING_MODULE_D_SERVICE=module-worker-d@staging",
			],
		});

		pagesAppPort = wranglerInstances[5].port;
		await setTimeout(1000);
	});

	afterAll(async () => {
		await Promise.allSettled(
			wranglerInstances.map((i) =>
				"stop" in i ? i.stop() : terminateWranglerInstance(i)
			)
		);
	});

	it("connects up Workers (both module and service ones) and fetches from them", async () => {
		const combinedResponse = await waitUntilReady(
			`http://127.0.0.1:${pagesAppPort}/`
		);
		const json = await combinedResponse.json();
		expect(json).toMatchInlineSnapshot(`
			{
			  "moduleWorkerAResponse": "Hello from module worker a",
			  "moduleWorkerBResponse": "Hello from module worker b and also: Hello from module worker a",
			  "serviceWorkerAResponse": "Hello from service worker a",
			}
		`);
	});

	it("respects the environments specified for the service bindings (and doesn't connect if the env doesn't match)", async () => {
		const combinedResponse = await waitUntilReady(
			`http://127.0.0.1:${pagesAppPort}/env`
		);
		const json = await combinedResponse.json();
		expect(json).toMatchInlineSnapshot(`
			{
			  "moduleWorkerCResponse": "Hello from module worker c (staging)",
			  "moduleWorkerDResponse": "[wrangler] Couldn't find \`wrangler dev\` session for service "module-worker-d-staging" to proxy to",
			}
		`);
	});
});

async function getWranglerInstance({
	pages = false,
	dirName,
	extraArgs = [],
}: {
	pages?: boolean;
	dirName: string;
	extraArgs?: string[];
}): Promise<WranglerInstance> {
	return new Promise((resolve) => {
		const childProcess = fork(
			path.join("..", "..", "..", "packages", "wrangler", "bin", "wrangler.js"),
			[
				...(pages ? ["pages"] : []),
				"dev",
				"--x-dev-env",
				"--x-registry",
				...(pages ? ["public"] : ["index.ts"]),
				"--local",
				...extraArgs,
			],
			{
				cwd: path.resolve(__dirname, "..", dirName),
				env: { BROWSER: "none", ...process.env },
				stdio: ["ignore", "ignore", "ignore", "ipc"],
			}
		).on("message", (message) => {
			const parsedMessage = JSON.parse(message.toString());
			resolve({
				dirName,
				childProcess,
				ip: parsedMessage.ip,
				port: parsedMessage.port,
			});
		});
	});
}

function terminateWranglerInstance({
	childProcess,
}: WranglerInstance): Promise<unknown> {
	return new Promise((resolve, reject) => {
		childProcess.once("exit", (code) => {
			if (!code) {
				resolve(code);
			} else {
				reject(code);
			}
		});
		childProcess.kill("SIGTERM");
	});
}
