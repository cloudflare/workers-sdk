import type { ChildProcess } from "child_process";

import { fork, spawnSync } from "child_process";
import { fetch } from "miniflare";
import * as path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const isWindows = process.platform === "win32";

describe.skip("Pages Functions", () => {
	let wranglerProcess: ChildProcess;
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
		wranglerProcess = fork(
			path.join("..", "..", "packages", "wrangler", "bin", "wrangler.js"),
			[
				"pages",
				"dev",
				"--port=0",
				"--inspector-port=0",
				"--proxy=8791",
				"--",
				"pnpm run server",
			],
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
