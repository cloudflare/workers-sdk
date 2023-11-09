import { fork } from "child_process";
import * as path from "path";
import { fetch } from "undici";
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import type { ChildProcess } from "child_process";
import { type UnstableDevWorker, unstable_dev } from "wrangler";

describe("Pages Functions", () => {
	let a: UnstableDevWorker;
	let b: UnstableDevWorker;
	let c: UnstableDevWorker;

	let dWranglerProcess: ChildProcess;
	let dIP: string;
	let dPort: number;
	let dResolveReadyPromise: (value: unknown) => void;
	const dReadyPromise = new Promise((resolve) => {
		dResolveReadyPromise = resolve;
	});

	beforeAll(async () => {
		a = await unstable_dev(path.join(__dirname, "../a/index.ts"), {
			config: path.join(__dirname, "../a/wrangler.toml"),
		});
		b = await unstable_dev(path.join(__dirname, "../b/index.ts"), {
			config: path.join(__dirname, "../b/wrangler.toml"),
		});

		c = await unstable_dev(path.join(__dirname, "../c/index.ts"), {
			config: path.join(__dirname, "../c/wrangler.toml"),
		});

		dWranglerProcess = fork(
			path.join("..", "..", "..", "packages", "wrangler", "bin", "wrangler.js"),
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
		await dReadyPromise;
		await a.stop();
		await b.stop();
		await c.stop();

		await new Promise((resolve, reject) => {
			dWranglerProcess.once("exit", (code) => {
				if (!code) {
					resolve(code);
				} else {
					reject(code);
				}
			});
			dWranglerProcess.kill("SIGTERM");
		});
	});

	it("connects up Durable Objects and keeps state across wrangler instances", async () => {
		await dReadyPromise;

		// Service registry is polled every 300ms,
		// so let's give all the Workers a little time to find each other
		await new Promise((resolve) => setTimeout(resolve, 700));

		const responseA = await a.fetch(`/`, {
			headers: {
				"X-Reset-Count": "true",
			},
		});
		const dataA = (await responseA.json()) as { count: number; id: string };
		expect(dataA.count).toEqual(1);
		const responseB = await b.fetch(`/`);
		const dataB = (await responseB.json()) as { count: number; id: string };
		expect(dataB.count).toEqual(2);
		const responseC = await c.fetch(`/`);
		const dataC = (await responseC.json()) as { count: number; id: string };
		expect(dataC.count).toEqual(3);
		const responseD = await fetch(`http://${dIP}:${dPort}/`);
		const dataD = (await responseD.json()) as { count: number; id: string };
		expect(dataD.count).toEqual(4);
		const responseA2 = await a.fetch(`/`);
		const dataA2 = (await responseA2.json()) as { count: number; id: string };
		expect(dataA2.count).toEqual(5);
		expect(dataA.id).toEqual(dataB.id);
		expect(dataA.id).toEqual(dataC.id);
		expect(dataA.id).toEqual(dataA2.id);
	});
});
