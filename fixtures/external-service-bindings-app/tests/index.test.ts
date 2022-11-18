import { spawn } from "child_process";
import * as path from "path";
import { fetch } from "undici";
import type { ChildProcess } from "child_process";
import type { Response } from "undici";

const waitUntilReady = async (url: string): Promise<Response> => {
	let response: Response | undefined = undefined;

	while (response === undefined) {
		await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));

		try {
			response = await fetch(url);
		} catch {}
	}

	return response as Response;
};

const isWindows = process.platform === "win32";

describe.skip("Pages Functions", () => {
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

	it("connects up a Service and fetches between Workers/Functions", async () => {
		const responseA = await waitUntilReady("http://localhost:8400/");
		const dataA = await responseA.text();
		expect(dataA).toEqual('Hello from service "a"');
		const responseB = await waitUntilReady("http://localhost:8401/");
		const dataB = await responseB.text();
		expect(dataB).toEqual('Hello from service "a"');
		const responseC = await waitUntilReady("http://localhost:8402/");
		const dataC = await responseC.text();
		expect(dataC).toEqual('Hello from service "a"');
		const dataD = await responseA.text();
		expect(dataD).toEqual('Hello from service "a"');
	});
});
