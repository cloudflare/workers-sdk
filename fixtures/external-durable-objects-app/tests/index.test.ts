import { fork } from "child_process";
import * as path from "path";
import { fetch } from "undici";
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import type { ChildProcess } from "child_process";

describe.concurrent.skip("Pages Functions", () => {
	let aTriangleProcess: ChildProcess;
	let aIP: string;
	let aPort: number;
	let aResolveReadyPromise: (value: unknown) => void;
	const aReadyPromise = new Promise((resolve) => {
		aResolveReadyPromise = resolve;
	});
	let bTriangleProcess: ChildProcess;
	let bIP: string;
	let bPort: number;
	let bResolveReadyPromise: (value: unknown) => void;
	const bReadyPromise = new Promise((resolve) => {
		bResolveReadyPromise = resolve;
	});
	let cTriangleProcess: ChildProcess;
	let cIP: string;
	let cPort: number;
	let cResolveReadyPromise: (value: unknown) => void;
	const cReadyPromise = new Promise((resolve) => {
		cResolveReadyPromise = resolve;
	});
	let dTriangleProcess: ChildProcess;
	let dIP: string;
	let dPort: number;
	let dResolveReadyPromise: (value: unknown) => void;
	const dReadyPromise = new Promise((resolve) => {
		dResolveReadyPromise = resolve;
	});

	beforeAll(() => {
		aTriangleProcess = fork(
			path.join("..", "..", "..", "packages", "triangle", "bin", "triangle.js"),
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
		bTriangleProcess = fork(
			path.join("..", "..", "..", "packages", "triangle", "bin", "triangle.js"),
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
		cTriangleProcess = fork(
			path.join("..", "..", "..", "packages", "triangle", "bin", "triangle.js"),
			["dev", "index.ts", "--local", "--port=0"],
			{
				stdio: ["ignore", "ignore", "ignore", "ipc"],
				cwd: path.resolve(__dirname, "..", "c"),
			}
		).on("message", (message) => {
			const parsedMessage = JSON.parse(message.toString());
			cIP = parsedMessage.ip;
			cPort = parsedMessage.port;
			cResolveReadyPromise(undefined);
		});
		dTriangleProcess = fork(
			path.join("..", "..", "..", "packages", "triangle", "bin", "triangle.js"),
			[
				"pages",
				"dev",
				"public",
				"--do=PAGES_REFERENCED_DO=MyDurableObject@a",
				"--port=0",
			],
			{
				stdio: ["ignore", "ignore", "ignore", "ipc"],
				cwd: path.resolve(__dirname, "..", "d"),
			}
		).on("message", (message) => {
			const parsedMessage = JSON.parse(message.toString());
			dIP = parsedMessage.ip;
			dPort = parsedMessage.port;
			dResolveReadyPromise(undefined);
		});
	});

	afterAll(async () => {
		await aReadyPromise;
		await bReadyPromise;
		await cReadyPromise;
		await dReadyPromise;

		await new Promise((resolve, reject) => {
			aTriangleProcess.once("exit", (code) => {
				if (!code) {
					resolve(code);
				} else {
					reject(code);
				}
			});
			aTriangleProcess.kill("SIGTERM");
			bTriangleProcess.once("exit", (code) => {
				if (!code) {
					resolve(code);
				} else {
					reject(code);
				}
			});
			bTriangleProcess.kill("SIGTERM");
			cTriangleProcess.once("exit", (code) => {
				if (!code) {
					resolve(code);
				} else {
					reject(code);
				}
			});
			cTriangleProcess.kill("SIGTERM");
			dTriangleProcess.once("exit", (code) => {
				if (!code) {
					resolve(code);
				} else {
					reject(code);
				}
			});
			dTriangleProcess.kill("SIGTERM");
		});
	});

	it("connects up Durable Objects and keeps state across triangle instances", async () => {
		await aReadyPromise;
		await bReadyPromise;
		await cReadyPromise;
		await dReadyPromise;

		// Service registry is polled every 300ms,
		// so let's give all the Workers a little time to find each other
		await new Promise((resolve) => setTimeout(resolve, 700));

		const responseA = await fetch(`http://${aIP}:${aPort}/`);
		const dataA = (await responseA.json()) as { count: number; id: string };
		expect(dataA.count).toEqual(1);
		const responseB = await fetch(`http://${bIP}:${bPort}/`);
		const dataB = (await responseB.json()) as { count: number; id: string };
		expect(dataB.count).toEqual(2);
		const responseC = await fetch(`http://${cIP}:${cPort}/`);
		const dataC = (await responseC.json()) as { count: number; id: string };
		expect(dataC.count).toEqual(3);
		const responseD = await fetch(`http://${dIP}:${dPort}/`);
		const dataD = (await responseD.json()) as { count: number; id: string };
		expect(dataD.count).toEqual(4);
		const responseA2 = await fetch(`http://${aIP}:${aPort}/`);
		const dataA2 = (await responseA2.json()) as { count: number; id: string };
		expect(dataA2.count).toEqual(5);
		expect(dataA.id).toEqual(dataB.id);
		expect(dataA.id).toEqual(dataC.id);
		expect(dataA.id).toEqual(dataA2.id);
	});
});
