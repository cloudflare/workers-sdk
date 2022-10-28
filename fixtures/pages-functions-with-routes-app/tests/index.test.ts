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

	it("should render static pages", async () => {
		const response = await waitUntilReady(
			"http://localhost:8776/undefined-route"
		);
		const text = await response.text();
		expect(text).toContain(
			"Bienvenue sur notre projet &#10024; pages-functions-with-routes-app!"
		);
	});

	it("should correctly apply the routing rules provided in the custom _routes.json file", async () => {
		// matches / include rule
		let response = await waitUntilReady("http://localhost:8776");
		let text = await response.text();
		expect(text).toEqual("ROOT");

		// matches /greeting/* include rule
		response = await waitUntilReady("http://localhost:8776/greeting");
		text = await response.text();
		expect(text).toEqual("[/functions/greeting/index]: Bonjour alligator!");

		// matches /greeting/* include rule
		response = await waitUntilReady("http://localhost:8776/greeting/hello");
		text = await response.text();
		expect(text).toEqual("[/functions/greeting/hello]: Bonjour le monde!");

		// matches /greeting/* include rule
		response = await waitUntilReady("http://localhost:8776/greeting/bye");
		text = await response.text();
		expect(text).toEqual("[/functions/greeting/bye]: A plus tard alligator 👋");

		// matches both include|exclude /date rules, but exclude has priority
		response = await waitUntilReady("http://localhost:8776/date");
		text = await response.text();
		expect(text).toContain(
			"Bienvenue sur notre projet &#10024; pages-functions-with-routes-app!"
		);

		// matches /bye* exclude rule
		response = await waitUntilReady("http://localhost:8776/bye");
		text = await response.text();
		expect(text).toContain(
			"Bienvenue sur notre projet &#10024; pages-functions-with-routes-app!"
		);

		// matches /greeting* include rule
		response = await waitUntilReady("http://localhost:8776/greetings");
		text = await response.text();
		expect(text).toEqual("[/functions/greetings]: Bonjour à tous!");
	});
});
