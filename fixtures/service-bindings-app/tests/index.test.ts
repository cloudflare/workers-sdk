import { fork } from "child_process";
import * as path from "path";
import { fetch } from "undici";
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import type { ChildProcess } from "child_process";

describe.concurrent.skip("Service Bindings", () => {
	let aProcess: ChildProcess;
	let aIP: string;
	let aPort: number;
	let aResolveReadyPromise: (value: unknown) => void;
	const aReadyPromise = new Promise((resolve) => {
		aResolveReadyPromise = resolve;
	});

	let bProcess: ChildProcess;
	let bIP: string;
	let bPort: number;
	let bResolveReadyPromise: (value: unknown) => void;
	const bReadyPromise = new Promise((resolve) => {
		bResolveReadyPromise = resolve;
	});

	beforeAll(() => {
		aProcess = fork(
			path.join("..", "..", "..", "packages", "wrangler", "bin", "wrangler.js"),
			["dev", "index.ts", "--local", "--port=0"],
			{
				stdio: ["ignore", "ignore", "ignore", "ipc"],
				cwd: path.resolve(__dirname, "..", "a"),
			}
		).on("message", (message) => {
			const parsedMessage = JSON.parse(message.toString());
			aIP = parsedMessage.ip;
			aPort = parsedMessage.port;
			aResolveReadyPromise(undefined);
		});

		bProcess = fork(
			path.join("..", "..", "..", "packages", "wrangler", "bin", "wrangler.js"),
			["dev", "index.ts", "--local", "--port=0"],
			{
				stdio: ["ignore", "ignore", "ignore", "ipc"],
				cwd: path.resolve(__dirname, "..", "b"),
			}
		).on("message", (message) => {
			const parsedMessage = JSON.parse(message.toString());
			bIP = parsedMessage.ip;
			bPort = parsedMessage.port;
			bResolveReadyPromise(undefined);
		});
	});

	afterAll(async () => {
		await aReadyPromise;
		await bReadyPromise;
		await new Promise((resolve, reject) => {
			aProcess.once("exit", (code) => {
				if (!code) {
					resolve(code);
				} else {
					reject(code);
				}
			});
			aProcess.kill("SIGTERM");

			bProcess.once("exit", (code) => {
				if (!code) {
					resolve(code);
				} else {
					reject(code);
				}
			});
			bProcess.kill("SIGTERM");
		});
	});

	it("connects up Durable Objects and keeps state across wrangler instances", async () => {
		await aReadyPromise;
		await bReadyPromise;

		// Service registry is polled every 300ms,
		// so let's give worker A some time to find B
		await new Promise((resolve) => setTimeout(resolve, 700));

		const responseA = await fetch(`http://${aIP}:${aPort}/`);
		const textA = await responseA.text();
		expect(textA).toEqual("hello world");

		const responseB = await fetch(`http://${bIP}:${bPort}/`);
		const textB = await responseB.text();
		expect(textB).toEqual("hello world");
	});
});
