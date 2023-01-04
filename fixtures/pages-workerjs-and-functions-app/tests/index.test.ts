import { fork } from "child_process";
import * as path from "path";
import { fetch } from "undici";
import { describe, it, beforeAll, afterAll } from "vitest";
import type { ChildProcess } from "child_process";

describe("Pages project with `_worker.js` and `/functions` directory", () => {
	let wranglerProcess: ChildProcess;
	let ip: string;
	let port: number;

	// const std = mockConsoleMethods();
	beforeAll(async () => {
		await new Promise((resolve) => {
			wranglerProcess = fork(
				path.join("..", "..", "packages", "wrangler", "bin", "wrangler.js"),
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

	it.concurrent("renders static pages", async ({ expect }) => {
		const response = await fetch(`http://${ip}:${port}/`);
		const text = await response.text();
		expect(text).toContain(
			"Bienvenue sur notre projet &#10024; pages-workerjs-and-functions-app!"
		);
	});

	it.concurrent(
		"runs our _worker.js and ignores the functions directory",
		async ({ expect }) => {
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
