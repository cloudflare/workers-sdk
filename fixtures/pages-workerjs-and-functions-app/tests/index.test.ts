import { spawn } from "child_process";
import * as path from "path";
import { fetch } from "undici";
import type { ChildProcess } from "child_process";

const isWindows = process.platform === "win32";

describe("Pages project with `_worker.js` and `/functions` directory", () => {
	let wranglerProcess: ChildProcess;
	let ip: string;
	let port: number;
	let resolveReadyPromise: (value: unknown) => void;
	const readyPromise = new Promise((resolve) => {
		resolveReadyPromise = resolve;
	});

	// const std = mockConsoleMethods();
	beforeAll(() => {
		wranglerProcess = spawn(
			"node",
			[
				path.join("..", "..", "packages", "wrangler", "bin", "wrangler.js"),
				"pages",
				"dev",
				"public",
				"--port=0",
			],
			{
				shell: isWindows,
				stdio: ["inherit", "inherit", "inherit", "ipc"],
				cwd: path.resolve(__dirname, ".."),
				env: { BROWSER: "none", ...process.env },
			}
		).on("message", (message) => {
			const parsedMessage = JSON.parse(message.toString());
			ip = parsedMessage.ip;
			port = parsedMessage.port;
			resolveReadyPromise(undefined);
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

	it.concurrent("renders static pages", async () => {
		await readyPromise;
		const response = await fetch(`http://${ip}:${port}/`);
		const text = await response.text();
		expect(text).toContain(
			"Bienvenue sur notre projet &#10024; pages-workerjs-and-functions-app!"
		);
	});

	it.concurrent(
		"runs our _worker.js and ignores the functions directory",
		async () => {
			await readyPromise;
			let response = await fetch(`http://${ip}:${port}/greeting/hello`);
			let text = await response.text();
			expect(text).toEqual("Bonjour le monde!");

			response = await fetch(`http://${ip}:${port}/greeting/goodbye`);
			text = await response.text();
			expect(text).toEqual("A plus tard alligator 👋");

			response = await fetch(`http://${ip}:${port}/date`);
			text = await response.text();
			expect(text).toEqual(
				"Yesterday is history, tomorrow is a mystery, but today is a gift. That’s why it is called the present."
			);

			response = await fetch(`http://${ip}:${port}/party`);
			text = await response.text();
			expect(text).toEqual("Oops! Tous les alligators sont allés à la fête 🎉");
		}
	);
});
