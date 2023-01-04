import { fork, spawnSync } from "child_process";
import * as path from "path";
import { fetch } from "undici";
import { describe, it, beforeAll, afterAll } from "vitest";
import type { ChildProcess } from "child_process";

const isWindows = process.platform === "win32";

describe("Remix", () => {
	let wranglerProcess: ChildProcess;
	let ip: string;
	let port: number;

	beforeAll(async () => {
		await new Promise((resolve) => {
			spawnSync("npm", ["run", "build"], {
				shell: isWindows,
				cwd: path.resolve(__dirname, ".."),
			});
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
				resolve(undefined);
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

	it.concurrent("renders", async ({ expect }) => {
		const response = await fetch(`http://${ip}:${port}/`);
		const text = await response.text();
		expect(text).toContain("Welcome to Remix");
	});
});
