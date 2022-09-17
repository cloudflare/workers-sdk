import { spawn } from "child_process";
import * as path from "path";
import patchConsole from "patch-console";
import { fetch } from "undici";
import type { ChildProcess } from "child_process";

const isWindows = process.platform === "win32";

describe("Pages _worker.js", () => {
	let wranglerProcess: ChildProcess;
	let ip: string;
	let port: number;
	let resolveReadyPromise: (value: unknown) => void;
	const readyPromise = new Promise((resolve) => {
		resolveReadyPromise = resolve;
	});

	beforeAll(() => {
		wranglerProcess = spawn(
			"node",
			[
				path.join("..", "..", "packages", "wrangler", "bin", "wrangler.js"),
				"pages",
				"dev",
				"./workerjs-test",
				"--port",
				"0",
			],
			{
				shell: isWindows,
				stdio: ["inherit", "inherit", "pipe", "ipc"],
				cwd: path.resolve(__dirname, "../"),
			}
		).on("message", (message) => {
			const parsedMessage = JSON.parse(message.toString());
			ip = parsedMessage.ip;
			port = parsedMessage.port;
			resolveReadyPromise(null);
		});
	});

	afterAll(async () => {
		patchConsole(() => {});

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

	it.concurrent("renders static pages", async () => {
		await readyPromise;
		const response = await fetch(`http://${ip}:${port}/`);
		const text = await response.text();
		expect(text).toContain("test");
	});

	it.concurrent("shows an error for the import in _worker.js", async () => {
		await readyPromise;
		let stderr = "";
		wranglerProcess.stderr.on("data", (chunk) => {
			console.error(stderr.toString());
			stderr += chunk.toString();
		});
		const response = await fetch(`http://${ip}:${port}/`);
		const text = await response.text();
		expect(text).toContain("test");

		expect(stderr).toContain(
			"_worker.js is importing from another file. This will throw an error if deployed."
		);
	});
});
