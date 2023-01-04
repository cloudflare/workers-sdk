import { fork } from "child_process";
import * as path from "path";
import { fetch } from "undici";
import { describe, it, beforeAll, afterAll } from "vitest";
import type { ChildProcess } from "child_process";

describe("'wrangler dev' correctly renders pages", () => {
	let wranglerProcess: ChildProcess;
	let ip: string;
	let port: number;

	// const std = mockConsoleMethods();
	beforeAll(async () => {
		await new Promise((resolve) => {
			wranglerProcess = fork(
				path.join("..", "..", "packages", "wrangler", "bin", "wrangler.js"),
				["dev", "--local", "--port=0"],
				{
					stdio: ["inherit", "inherit", "inherit", "ipc"],
					cwd: path.resolve(__dirname, ".."),
				}
			).on("message", (message) => {
				const parsedMessage = JSON.parse(message.toString());
				ip = parsedMessage.ip;
				port = parsedMessage.port;
				resolve(null);
			});
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

	it.concurrent("renders ", async ({ expect }) => {
		const response = await fetch(`http://${ip}:${port}/`);
		const text = await response.text();
		expect(text).toContain(`http://${ip}:${port}/`);
	});
});
