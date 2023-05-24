import { fork } from "child_process";
import * as path from "path";
import { fetch } from "undici";
import { describe, it, beforeAll, afterAll } from "vitest";
import type { ChildProcess } from "child_process";

describe.concurrent("Pages Functions", () => {
	let triangleProcess: ChildProcess;
	let ip: string;
	let port: number;

	beforeAll(async () => {
		await new Promise((resolve) => {
			triangleProcess = fork(
				path.join("..", "..", "packages", "triangle", "bin", "triangle.js"),
				["pages", "dev", "public", "--port=0"],
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

	it("mounts a plugin correctly at root", async ({ expect }) => {
		const response = await fetch(`http://${ip}:${port}/api/v1/instance`);
		const text = await response.text();
		expect(text).toMatchInlineSnapshot(`"Response from a nested folder"`);
	});
});
