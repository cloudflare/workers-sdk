import { spawn } from "child_process";
import * as path from "path";
import { fetch } from "undici";
import type { ChildProcess } from "child_process";
import type { Response } from "undici";

const waitUntilReady = async (url: string): Promise<Response> => {
	let response: Response | undefined = undefined;

	while (response === undefined) {
		await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));

		try {
			response = await fetch(url);
		} catch {}
	}

	return response as Response;
};

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

	let cProcess: ChildProcess;
	let cIP: string;
	let cPort: number;
	let cResolveReadyPromise: (value: unknown) => void;
	const cReadyPromise = new Promise((resolve) => {
		cResolveReadyPromise = resolve;
	});

	let dProcess: ChildProcess;
	let dIP: string;
	let dPort: number;
	let dResolveReadyPromise: (value: unknown) => void;
	const dReadyPromise = new Promise((resolve) => {
		dResolveReadyPromise = resolve;
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

		cProcess = spawn(
			"node",
			[
				path.join("..", "..", "packages", "wrangler", "bin", "wrangler.js"),
				"dev",
				"c/index.ts",
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
			cIP = parsedMessage.ip;
			cPort = parsedMessage.port;
			cResolveReadyPromise(null);
		});

		dProcess = spawn(
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
				"pages",
				"dev",
				"public",
				"--do",
				"PAGES_REFERENCED_DO=MyDurableObject@a",
				"--port",
				"0",
			],
			{
				shell: isWindows,
				stdio: ["inherit", "inherit", "inherit", "ipc"],
				cwd: path.resolve(__dirname, "../d"),
			}
		).on("message", (message) => {
			const parsedMessage = JSON.parse(message.toString());
			dIP = parsedMessage.ip;
			dPort = parsedMessage.port;
			dResolveReadyPromise(null);
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

			cProcess.once("exit", (code) => {
				if (!code) {
					resolve(code);
				} else {
					reject(code);
				}
			});
			cProcess.kill("SIGTERM");

			dProcess.once("exit", (code) => {
				if (!code) {
					resolve(code);
				} else {
					reject(code);
				}
			});
			dProcess.kill("SIGTERM");
		});
	});

	it.concurrent(
		"connects up Durable Objects and keeps state across wrangler instances",
		async () => {
			await aReadyPromise;
			await bReadyPromise;
			await cReadyPromise;
			await dReadyPromise;

			const responseA = await waitUntilReady(`http://${aIP}:${aPort}/`);
			const dataA = (await responseA.json()) as { count: number; id: string };
			expect(dataA.count).toEqual(1);
			const responseB = await waitUntilReady(`http://${bIP}:${bPort}/`);
			const dataB = (await responseB.json()) as { count: number; id: string };
			expect(dataB.count).toEqual(2);
			const responseC = await waitUntilReady(`http://${cIP}:${cPort}/`);
			const dataC = (await responseC.json()) as { count: number; id: string };
			expect(dataC.count).toEqual(3);
			const responseD = await waitUntilReady(`http://${dIP}:${dPort}/`);
			const dataD = (await responseD.json()) as { count: number; id: string };
			expect(dataD.count).toEqual(4);
			const responseA2 = await waitUntilReady(`http://${aIP}:${aPort}/`);
			const dataA2 = (await responseA2.json()) as { count: number; id: string };
			expect(dataA2.count).toEqual(5);

			expect(dataA.id).toEqual(dataB.id);
			expect(dataA.id).toEqual(dataC.id);
			expect(dataA.id).toEqual(dataA2.id);
		}
	);
});
