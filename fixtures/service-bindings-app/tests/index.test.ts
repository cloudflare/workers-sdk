import { spawn } from "child_process";
import * as path from "path";
import { fetch } from "undici";
import type { ChildProcess } from "child_process";

const isWindows = process.platform === "win32";

describe("Pages Functions", () => {
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
				path.join("..", "..", "packages", "wrangler", "bin", "wrangler.js"),
				"dev",
				"a/index.ts",
				"--local",
				"--port",
				"0",
			],
			{
				shell: isWindows,
				stdio: ["inherit", "inherit", "inherit", "ipc"],
				cwd: path.resolve(__dirname, "../"),
			}
		).on("message", (message) => {
			const parsedMessage = JSON.parse(message.toString());
			aIP = parsedMessage.ip;
			aPort = parsedMessage.port;
			aResolveReadyPromise(null);
		});

		bProcess = spawn(
			"node",
			[
				path.join("..", "..", "packages", "wrangler", "bin", "wrangler.js"),
				"dev",
				"b/index.ts",
				"--local",
				"--port",
				"0",
			],
			{
				shell: isWindows,
				stdio: ["inherit", "inherit", "inherit", "ipc"],
				cwd: path.resolve(__dirname, "../"),
			}
		).on("message", (message) => {
			const parsedMessage = JSON.parse(message.toString());
			bIP = parsedMessage.ip;
			bPort = parsedMessage.port;
			bResolveReadyPromise(null);
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

			console.log(`http://${aIP}:${aPort}/`);
			console.log(`http://${bIP}:${bPort}/`);
			const responseA = await fetch(`http://${aIP}:${aPort}/`);
			const textA = await responseA.text();
			// expect(textA).toEqual("hello world");

			const responseB = await fetch(`http://${bIP}:${bPort}/`);
			const textB = (await responseB.text()) as { count: number; id: string };
			expect(textB).toEqual("hello world");
		}
	);
});
