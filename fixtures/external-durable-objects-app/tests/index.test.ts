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

describe("Pages Functions", () => {
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

	it("connects up Durable Objects and keeps state across wrangler instances", async () => {
		const responseA = await waitUntilReady("http://localhost:8400/");
		const dataA = (await responseA.json()) as { count: number; id: string };
		expect(dataA.count).toEqual(1);
		const responseB = await waitUntilReady("http://localhost:8401/");
		const dataB = (await responseB.json()) as { count: number; id: string };
		expect(dataB.count).toEqual(2);
		const responseC = await waitUntilReady("http://localhost:8402/");
		const dataC = (await responseC.json()) as { count: number; id: string };
		expect(dataC.count).toEqual(3);
		const responseD = await waitUntilReady("http://localhost:8403/");
		const dataD = (await responseD.json()) as { count: number; id: string };
		expect(dataD.count).toEqual(4);
		const responseA2 = await waitUntilReady("http://localhost:8400/");
		const dataA2 = (await responseA2.json()) as { count: number; id: string };
		expect(dataA2.count).toEqual(5);
		expect(dataA.id).toEqual(dataB.id);
		expect(dataA.id).toEqual(dataC.id);
		expect(dataA.id).toEqual(dataA2.id);
	});
});
