import { spawn } from "child_process";
import * as path from "path";
import { fetch } from "undici";
import type { ChildProcess } from "child_process";

const isWindows = process.platform === "win32";

describe("Service Bindings", () => {
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
		aProcess = spawn(
			"node",
			[
				path.join(
					"..",
					"..",
					"..",
					"packages",
					"wrangler",
					"bin",
					"wrangler.js"
				),
				"dev",
				"index.ts",
				"--local",
				"--port=0",
			],
			{
				shell: isWindows,
				stdio: ["inherit", "inherit", "inherit", "ipc"],
				cwd: path.resolve(__dirname, "..", "a"),
				env: { BROWSER: "none", ...process.env },
			}
		).on("message", (message) => {
			const parsedMessage = JSON.parse(message.toString());
			aIP = parsedMessage.ip;
			aPort = parsedMessage.port;
			aResolveReadyPromise(undefined);
		});

		bProcess = spawn(
			"node",
			[
				path.join(
					"..",
					"..",
					"..",
					"packages",
					"wrangler",
					"bin",
					"wrangler.js"
				),
				"dev",
				"index.ts",
				"--local",
				"--port=0",
			],
			{
				shell: isWindows,
				stdio: ["inherit", "inherit", "inherit", "ipc"],
				cwd: path.resolve(__dirname, "..", "b"),
				env: { BROWSER: "none", ...process.env },
			}
		).on("message", (message) => {
			const parsedMessage = JSON.parse(message.toString());
			bIP = parsedMessage.ip;
			bPort = parsedMessage.port;
			bResolveReadyPromise(undefined);
		});
	});

	afterAll(async () => {
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

	it.concurrent(
		"connects up Durable Objects and keeps state across wrangler instances",
		async () => {
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
		}
	);
});
