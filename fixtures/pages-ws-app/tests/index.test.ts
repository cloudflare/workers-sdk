import { fork, spawnSync } from "child_process";
import * as path from "path";
import { fetch } from "miniflare";
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import type { ChildProcess } from "child_process";

const isWindows = process.platform === "win32";

<<<<<<< HEAD
describe.concurrent.skip("Pages Functions", () => {
	let triangleProcess: ChildProcess;
=======
describe.skip("Pages Functions", () => {
	let wranglerProcess: ChildProcess;
>>>>>>> da9ba3c855317c6071eb892def4965706f2fb97f
	let ip: string;
	let port: number;
	let resolveReadyPromise: (value: unknown) => void;
	const readyPromise = new Promise((resolve) => {
		resolveReadyPromise = resolve;
	});

	beforeAll(() => {
		spawnSync("npm", ["run", "build"], {
			shell: isWindows,
			cwd: path.resolve(__dirname, ".."),
		});
		triangleProcess = fork(
			path.join("..", "..", "packages", "triangle", "bin", "triangle.js"),
			["pages", "dev", "--port=0", "--proxy=8791", "--", "npm run server"],
			{
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
			triangleProcess.once("exit", (code) => {
				if (!code) {
					resolve(code);
				} else {
					reject(code);
				}
			});
			triangleProcess.kill("SIGTERM");
		});
	});

	it("understands normal fetches", async () => {
		await readyPromise;
		const response = await fetch(`http://${ip}:${port}/`);
		expect(response.headers.get("x-proxied")).toBe("true");
		const text = await response.text();
		expect(text).toContain("Hello, world!");
	});

	it("understands websocket fetches", async () => {
		await readyPromise;
		const response = await fetch(`http://${ip}:${port}/ws`, {
			headers: { Upgrade: "websocket" },
		});
		expect(response.status).toBe(101);
		expect(response.webSocket).toBeDefined();
	});
});
