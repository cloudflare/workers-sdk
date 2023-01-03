import { fork } from "child_process";
import * as path from "path";
import { fetch } from "undici";
import type { ChildProcess } from "child_process";

describe("Pages Functions", () => {
	let wranglerProcess: ChildProcess;
	let ip: string;
	let port: number;
	let resolveReadyPromise: (value: unknown) => void;
	const readyPromise = new Promise((resolve) => {
		resolveReadyPromise = resolve;
	});

	beforeAll(async () => {
		wranglerProcess = fork(
			path.join("..", "..", "packages", "wrangler", "bin", "wrangler.js"),
			["pages", "dev", "public", "--port=0"],
			{
				stdio: ["inherit", "inherit", "inherit", "ipc"],
				cwd: path.resolve(__dirname, ".."),
			}
		).on("message", (message) => {
			const parsedMessage = JSON.parse(message.toString());
			ip = parsedMessage.ip;
			port = parsedMessage.port;
			resolveReadyPromise(undefined);
		});
	});

	afterAll(async () => {
		await readyPromise;
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

	it.concurrent("mounts a plugin correctly at root", async () => {
		await readyPromise;
		const response = await fetch(`http://${ip}:${port}/api/v1/instance`);
		const text = await response.text();
		expect(text).toMatchInlineSnapshot(`"Response from a nested folder"`);
	});
});
