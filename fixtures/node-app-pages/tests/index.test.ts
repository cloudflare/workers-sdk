import { spawn } from "child_process";
import path from "path";
import { fetch } from "undici";
import type { ChildProcess } from "child_process";

const isWindows = process.platform === "win32";

describe("Pages Dev", () => {
	let wranglerProcess: ChildProcess;
	let ip: string;
	let port: number;
	let resolveReadyPromise: (value: unknown) => void;
	const readyPromise = new Promise((resolve) => {
		resolveReadyPromise = resolve;
	});

	beforeAll(() => {
		wranglerProcess = spawn(
			"node",
			[
				path.join("..", "..", "packages", "wrangler", "bin", "wrangler.js"),
				"pages",
				"dev",
				"public",
				"--port",
				"0",
				"--node-compat",
			],
			{
				shell: isWindows,
				stdio: ["inherit", "inherit", "inherit", "ipc"],
				cwd: path.resolve(__dirname, "../"),
			}
		).on("message", (message) => {
			const parsedMessage = JSON.parse(message.toString());
			ip = parsedMessage.ip;
			port = parsedMessage.port;
			resolveReadyPromise(null);
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
			isWindows
				? wranglerProcess.kill("SIGTERM")
				: wranglerProcess.kill("SIGKILL");
		});
	});

	it.concurrent(
		"should work with `--node-compat` when running code requiring polyfills",
		async () => {
			await readyPromise;
			const response = await fetch(`http://${ip}:${port}/stripe`);

			await expect(response.text()).resolves.toContain(
				`"PATH":"path/to/some-file","STRIPE_OBJECT"`
			);
		}
	);
});
