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

describe("Pages _worker.js", () => {
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
		patchConsole(() => { });

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
		const response = await waitUntilReady("http://127.0.0.1:8792/");
		const text = await response.text();
		expect(text).toContain("test");
	});

	it.todo("shows an error for the import in _worker.js");
	// it("shows an error for the import in _worker.js", async () => {
	// 	const _ = await waitUntilReady("http://127.0.0.1:8792/");
	// 	expect(std.err).toMatchInlineSnapshot(`""`);
	// });
});
