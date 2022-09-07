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
			"Bonjour de notre projet ✨pages-workerjs-with-routes-app✨!"
		);
	});

	it("runs our _worker.js", async () => {
		let response = await waitUntilReady("http://127.0.0.1:8751/greeting/hello");
		let text = await response.text();
		expect(text).toContain("Bonjour le monde!");

		response = await waitUntilReady("http://127.0.0.1:8751/greeting/goodbye");
		text = await response.text();
		expect(text).toContain("A plus tard alligator 👋");

		response = await waitUntilReady("http://127.0.0.1:8751/date");
		text = await response.text();
		expect(text).toMatch(/\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d/);

		/**
		 * :sad_panda:
		 * only because we are in `dev` mode. For a deployed Pages project such as this, `/date`
		 * would return`index.html`, because we explicitly excluded it in our custom
		 * `_routes.json` file.
		 *
		 * `cd fixtures/pages-workerjs-with-routes-app && npx wrangler pages publish public` for
		 * now if you want to test that
		 *
		 */
		response = await waitUntilReady("http://127.0.0.1:8751/party");
		text = await response.text();
		expect(text).toContain(
			"Bonjour de notre projet ✨pages-workerjs-with-routes-app✨!"
		);
	});
});
