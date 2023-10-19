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
	let wranglerProcess: ChildProcess;

	beforeAll(() => {
		wranglerProcess = spawn("npm", ["run", "dev"], {
			shell: isWindows,
			cwd: path.resolve(__dirname, "../"),
			env: { BROWSER: "none", ...process.env },
		});
		wranglerProcess.stdout?.on("data", (chunk) => {
			console.log(chunk.toString());
		});
		wranglerProcess.stderr?.on("data", (chunk) => {
			console.log(chunk.toString());
		});
	});

	afterAll(async () => {
		await new Promise((resolve, reject) => {
			wranglerProcess.once("exit", (code) => {
				if (!code) {
					resolve(code);
				} else {
					reject(code);
				}
			});
			wranglerProcess.kill("SIGTERM");
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
