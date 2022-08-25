import { spawn } from "child_process";
import * as path from "path";
import { fetch } from "undici";
import type { ChildProcess } from "child_process";
import type { Response, RequestInit } from "undici";

const waitUntilReady = async (
	url: string,
	requestInit?: RequestInit
): Promise<Response> => {
	let response: Response | undefined = undefined;

	while (response === undefined) {
		await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));

		try {
			response = await fetch(url, requestInit);
		} catch {}
	}

	return response as Response;
};

const isWindows = process.platform === "win32";

describe("Pages Functions with custom _routes.json", () => {
	let wranglerProcess: ChildProcess;

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
		const response = await waitUntilReady("http://localhost:8776/");
		const text = await response.text();
		expect(text).toContain(
			"Bonjour de notre projet ✨pages-functions-with-routes-app✨!"
		);
	});

	it("runs each Pages Function when their corresponding URL path is hit", async () => {
		let response = await waitUntilReady("http://localhost:8776/greeting/hello");
		let text = await response.text();
		expect(text).toMatch("Bonjour le monde!");

		response = await waitUntilReady("http://localhost:8776/greeting/goodbye");
		text = await response.text();
		expect(text).toMatch("A plus tard alligator 👋");

		/**
		 * :sad_panda:
		 * only because we are in `dev` mode. For a deployed Pages project such as this,
		 * `/date` would return a `404` because we explicitly excluded it in our custom
		 * `_routes.json` file.
		 *
		 * `cd fixtures/pages-functions-with-routes-app && npx wrangler pages publish public`
		 * for now if you want to test that
		 *
		 */
		response = await waitUntilReady("http://localhost:8776/date");
		text = await response.text();
		expect(text).toMatch(/\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d/);
	});
});
