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
		const response = await waitUntilReady("http://localhost:8776/");
		const text = await response.text();
		expect(text).toContain(
			"Bienvenue sur notre projet &#10024; pages-functions-with-routes-app!"
		);
	});

	it("should correctly apply the routing rules provided in the custom _routes.json file", async () => {
		let response = await waitUntilReady("http://localhost:8776/greeting/hello");
		let text = await response.text();
		expect(text).toEqual("Bonjour le monde!");

		response = await waitUntilReady("http://localhost:8776/greeting/goodbye");
		text = await response.text();
		expect(text).toEqual("A plus tard alligator 👋");

		response = await waitUntilReady("http://localhost:8776/date");
		text = await response.text();
		expect(text).toContain(
			"Bienvenue sur notre projet &#10024; pages-functions-with-routes-app!"
		);
	});
});
