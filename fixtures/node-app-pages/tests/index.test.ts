import { fork } from "child_process";
import path from "path";
import { fetch } from "undici";
import { describe, it, beforeAll, afterAll } from "vitest";
import type { ChildProcess } from "child_process";

describe.concurrent("Pages Dev", () => {
	let wranglerProcess: ChildProcess;
	let ip: string;
	let port: number;

	beforeAll(async () => {
		await new Promise((resolve) => {
			wranglerProcess = fork(
				path.join("..", "..", "packages", "wrangler", "bin", "wrangler.js"),
				["pages", "dev", "public", "--node-compat", "--port=0"],
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

	it("should work with `--node-compat` when running code requiring polyfills", async ({
		expect,
	}) => {
		const response = await fetch(`http://${ip}:${port}/stripe`);

		await expect(response.text()).resolves.toContain(
			`"PATH":"path/to/some-file","STRIPE_OBJECT"`
		);
	});
});
