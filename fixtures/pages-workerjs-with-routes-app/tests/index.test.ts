import { spawn } from "child_process";
import * as path from "path";
import patchConsole from "patch-console";
import { fetch } from "undici";
// import { mockConsoleMethods } from "../../../packages/wrangler/src/__tests__/helpers/mock-console";
import type { ChildProcess } from "child_process";
import type { Response } from "undici";

const waitUntilReady = async (url: string): Promise<Response> => {
	let response: Response | undefined = undefined;

	while (response === undefined) {
		await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));

		try {
			response = await fetch(url);
		} catch (err) {}
	}

	return response as Response;
};

const isWindows = process.platform === "win32";

describe("Pages Advanced Mode with custom _routes.json", () => {
	let wranglerProcess: ChildProcess;

	// const std = mockConsoleMethods();
	beforeEach(() => {
		wranglerProcess = spawn("npm", ["run", "dev"], {
			shell: isWindows,
			cwd: path.resolve(__dirname, "../"),
			env: { BROWSER: "none", ...process.env },
		});
		wranglerProcess.stdout?.on("data", (chunk) => {
			console.log(chunk.toString());
		});
		wranglerProcess.stderr?.on("data", (chunk) => {
			console.log(chunk.toString());
		});
	});

	afterEach(async () => {
		patchConsole(() => {});

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

	it("renders static pages", async () => {
		const response = await waitUntilReady("http://127.0.0.1:8751/");
		const text = await response.text();
		expect(text).toContain(
			"Bienvenue sur notre projet &#10024; pages-workerjs-with-routes-app!"
		);
	});

	it("runs our _worker.js", async () => {
		// matches /greeting/* include rule
		let response = await waitUntilReady("http://127.0.0.1:8751/greeting/hello");
		let text = await response.text();
		expect(text).toEqual("[/greeting/hello]: Bonjour le monde!");

		// matches /greeting/* include rule
		response = await waitUntilReady("http://127.0.0.1:8751/greeting/bye");
		text = await response.text();
		expect(text).toEqual("[/greeting/bye]: A plus tard alligator 👋");

		// matches /date include rule
		response = await waitUntilReady("http://127.0.0.1:8751/date");
		text = await response.text();
		expect(text).toMatch(/\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d/);

		// matches both /party* include and /party exclude rules, but exclude
		// has priority
		response = await waitUntilReady("http://127.0.0.1:8751/party");
		text = await response.text();
		expect(text).toContain(
			"Bienvenue sur notre projet &#10024; pages-workerjs-with-routes-app!"
		);

		// matches /party* include rule
		response = await waitUntilReady("http://127.0.0.1:8751/party-disco");
		text = await response.text();
		expect(text).toEqual("[/party-disco]: Tout le monde à la discothèque 🪩");

		// matches /greeting/* include rule
		response = await waitUntilReady("http://127.0.0.1:8751/greeting");
		text = await response.text();
		expect(text).toEqual("[/greeting]: Bonjour à tous!");

		// matches no rule
		response = await waitUntilReady("http://127.0.0.1:8751/greetings");
		text = await response.text();
		expect(text).toContain(
			"Bienvenue sur notre projet &#10024; pages-workerjs-with-routes-app!"
		);
	});
});
