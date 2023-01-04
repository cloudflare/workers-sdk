import { fork } from "child_process";
import * as path from "path";
import { fetch } from "undici";
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import type { ChildProcess } from "child_process";

describe("Pages Functions with custom _routes.json", () => {
	let wranglerProcess: ChildProcess;
	let ip: string;
	let port: number;
	let resolveReadyPromise: (value: unknown) => void;
	const readyPromise = new Promise((resolve) => {
		resolveReadyPromise = resolve;
	});

	beforeAll(() => {
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
			resolveReadyPromise(undefined);
		});
	});

	afterAll(async () => {
		await readyPromise;
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

	it.concurrent("should render static pages", async () => {
		await readyPromise;
		const response = await fetch(`http://${ip}:${port}/undefined-route`);
		const text = await response.text();
		expect(text).toContain(
			"Bienvenue sur notre projet &#10024; pages-functions-with-routes-app!"
		);
	});

	it.concurrent(
		"should correctly apply the routing rules provided in the custom _routes.json file",
		async () => {
			await readyPromise;

			// matches / include rule
			let response = await fetch(`http://${ip}:${port}`);
			let text = await response.text();
			expect(text).toEqual("ROOT");

			// matches /greeting/* include rule
			response = await fetch(`http://${ip}:${port}/greeting`);
			text = await response.text();
			expect(text).toEqual("[/functions/greeting/index]: Bonjour alligator!");

			// matches /greeting/* include rule
			response = await fetch(`http://${ip}:${port}/greeting/hello`);
			text = await response.text();
			expect(text).toEqual("[/functions/greeting/hello]: Bonjour le monde!");

			// matches /greeting/* include rule
			response = await fetch(`http://${ip}:${port}/greeting/bye`);
			text = await response.text();
			expect(text).toEqual(
				"[/functions/greeting/bye]: A plus tard alligator 👋"
			);

			// matches both include|exclude /date rules, but exclude has priority
			response = await fetch(`http://${ip}:${port}/date`);
			text = await response.text();
			expect(text).toContain(
				"Bienvenue sur notre projet &#10024; pages-functions-with-routes-app!"
			);

			// matches /bye* exclude rule
			response = await fetch(`http://${ip}:${port}/bye`);
			text = await response.text();
			expect(text).toContain(
				"Bienvenue sur notre projet &#10024; pages-functions-with-routes-app!"
			);

			// matches /greeting* include rule
			response = await fetch(`http://${ip}:${port}/greetings`);
			text = await response.text();
			expect(text).toEqual("[/functions/greetings]: Bonjour à tous!");
		}
	);
});
