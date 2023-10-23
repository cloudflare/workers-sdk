import { fork } from "child_process";
import * as path from "path";
import type { ChildProcess } from "child_process";
import { describe, expect, it, beforeAll, afterAll, beforeEach } from "vitest";
import { fetch, type Response } from "undici";

const waitUntilReady = async (url: string): Promise<Response> => {
	let response: Response | undefined = undefined;

	while (response === undefined) {
		await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));

		try {
			response = await fetch(url);
		} catch {}
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
	let wranglerInstances: WranglerInstance[] = [];
	let pagesAppPort: string;

	beforeAll(async () => {
		wranglerInstances = await Promise.all(
			[
				{
					dirName: "module-worker-a",
				},
				{
					dirName: "module-worker-b",
				},
				{
					dirName: "service-worker-a",
				},
				{
					dirName: "module-worker-c",
					extraArgs: ["--env=staging"],
				},
				{
					dirName: "module-worker-d",
					extraArgs: ["--env=production"],
				},
				{
					pages: true,
					dirName: "pages-functions-app",
					extraArgs: [
						"--service=MODULE_A_SERVICE=module-worker-a",
						"--service=MODULE_B_SERVICE=module-worker-b",
						"--service=SERVICE_A_SERVICE=service-worker-a",
						"--service=STAGING_MODULE_C_SERVICE=module-worker-c@staging",
						"--service=STAGING_MODULE_D_SERVICE=module-worker-d@staging",
					],
				},
			].map(getWranglerInstance)
		);
		pagesAppPort =
			wranglerInstances.find(({ dirName }) => dirName === "pages-functions-app")
				?.port ?? "0";
	});

	afterAll(async () => {
		await Promise.allSettled(wranglerInstances.map(terminateWranglerInstance));
	});

	it("connects up Workers (both module and service ones) and fetches from them", async () => {
		const combinedResponse = await waitUntilReady(
			`http://localhost:${pagesAppPort}/`
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
			`http://localhost:${pagesAppPort}/env`
		);
		const json = await combinedResponse.json();
		expect(json).toMatchInlineSnapshot(`
			{
			  "moduleWorkerCResponse": "Hello from module worker c (staging)",
			  "moduleWorkerDResponse": "You should start up wrangler dev --local on the STAGING_MODULE_D_SERVICE worker",
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
				...(pages ? ["public"] : ["index.ts"]),
				"--local",
				`--port=0`,
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
