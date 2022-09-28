import { spawn } from "child_process";
import * as path from "path";
import patchConsole from "patch-console";
import { fetch } from "undici";
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

describe("Pages project with `_worker.js` and `/functions` directory", () => {
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
		const response = await waitUntilReady("http://127.0.0.1:8955/");
		const text = await response.text();
		expect(text).toContain(
			"Bienvenue sur notre projet &#10024; pages-workerjs-and-functions-app!"
		);
	});

	it("runs our _worker.js and ignores the functions directory", async () => {
		let response = await waitUntilReady("http://127.0.0.1:8955/greeting/hello");
		let text = await response.text();
		expect(text).toEqual("Bonjour le monde!");

		response = await waitUntilReady("http://127.0.0.1:8955/greeting/goodbye");
		text = await response.text();
		expect(text).toEqual("A plus tard alligator 👋");

		response = await waitUntilReady("http://127.0.0.1:8955/date");
		text = await response.text();
		expect(text).toEqual(
			"Yesterday is history, tomorrow is a mystery, but today is a gift. That’s why it is called the present."
		);

		response = await waitUntilReady("http://127.0.0.1:8955/party");
		text = await response.text();
		expect(text).toEqual("Oops! Tous les alligators sont allés à la fête 🎉");
	});
});
