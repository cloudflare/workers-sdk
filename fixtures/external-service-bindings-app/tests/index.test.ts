import { spawn } from "child_process";
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

const isWindows = process.platform === "win32";

describe("Pages Functions", () => {
	let childProcesses: ChildProcess[] = [];

	beforeAll(async () => {
		childProcesses = [
			{
				port: 8500,
				dirName: "module-worker-a",
			},
			{
				port: 8501,
				dirName: "module-worker-b",
			},
			{
				port: 8502,
				dirName: "service-worker-a",
			},
			{
				port: 8503,
				dirName: "module-worker-c",
				extraArgs: ["--env=staging"],
			},
			{
				port: 8504,
				dirName: "module-worker-d",
				extraArgs: ["--env=production"],
			},
		].map(startWranglerProcess);

		const pagesProcess = startWranglerProcess({
			pages: true,
			port: 8505,
			dirName: "pages-functions-app",
			extraArgs: [
				"--service=MODULE_A_SERVICE=module-worker-a",
				"--service=MODULE_B_SERVICE=module-worker-b",
				"--service=SERVICE_A_SERVICE=service-worker-a",
				"--service=STAGING_MODULE_C_SERVICE=module-worker-c@staging",
				"--service=STAGING_MODULE_D_SERVICE=module-worker-d@staging",
			],
		});
		childProcesses.push(pagesProcess);
	});

	afterAll(async () => {
		await new Promise((resolve, reject) => {
			childProcesses.forEach((childProcess) => {
				childProcess.once("exit", (code) => {
					if (!code) {
						resolve(code);
					} else {
						reject(code);
					}
				});
				childProcess.kill("SIGTERM");
			});
		});
	});

	beforeEach(async () => {
		await Promise.all(
			[8500, 8501, 8502, 8503, 8504, 8505].map((port) =>
				waitUntilReady(`http://localhost:${port}`)
			)
		);
	});

	it("connects up Workers (both module and service ones) and fetches from them", async () => {
		const combinedResponse = await waitUntilReady("http://localhost:8505/");
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
		const combinedResponse = await waitUntilReady("http://localhost:8505/env");
		const json = await combinedResponse.json();
		expect(json).toMatchInlineSnapshot(`
			{
			  "moduleWorkerCResponse": "Hello from module worker c (staging)",
			  "moduleWorkerDResponse": "You should start up wrangler dev --local on the STAGING_MODULE_D_SERVICE worker",
			}
		`);
	});
});

function startWranglerProcess({
	pages = false,
	port,
	dirName,
	extraArgs = [],
}: {
	pages?: boolean;
	port: number;
	dirName: string;
	extraArgs?: string[];
}) {
	const wranglerProcess = spawn(
		path.join("..", "..", "..", "packages", "wrangler", "bin", "wrangler.js"),
		[
			...(pages ? ["pages"] : []),
			"dev",
			...(pages ? ["public"] : ["index.ts"]),
			"--local",
			`--port=${port}`,
			...extraArgs,
		],
		{
			shell: isWindows,
			cwd: path.resolve(__dirname, "..", dirName),
			env: { BROWSER: "none", ...process.env },
		}
	);
	wranglerProcess.stdout?.on("data", (chunk) => {
		console.log(chunk.toString());
	});
	wranglerProcess.stderr?.on("data", (chunk) => {
		console.log(chunk.toString());
	});
	return wranglerProcess;
}
