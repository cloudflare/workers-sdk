import path from "node:path";
import { Response, fetch } from "undici";
import { describe, it, expect } from "vitest";
import { ChildProcess, fork } from "node:child_process";
import { setTimeout } from "node:timers/promises";

describe("Pages dev with proxy and a script file", () => {
	it("should handle requests using a script from the default _worker.js path", async () => {
		const { port, childProcess } = await startWranglerPagesDevProxy();
		const combinedResponse = await waitUntilReady(`http://127.0.0.1:${port}/`);
		const respText = await combinedResponse.text();
		expect(respText).toMatchInlineSnapshot('"hello from _worker.js"');
		await terminateChildProcess(childProcess);
	});

	it("should handle requests using a script from a custom script path", async () => {
		const { port, childProcess } = await startWranglerPagesDevProxy([
			"--script-path=custom/script/path/index.js",
		]);
		const combinedResponse = await waitUntilReady(`http://127.0.0.1:${port}/`);
		const respText = await combinedResponse.text();
		expect(respText).toMatchInlineSnapshot(
			'"hello from custom/script/path/index.js"'
		);
		await terminateChildProcess(childProcess);
	});
});

async function startWranglerPagesDevProxy(extraArgs: string[] = []): Promise<{
	childProcess: ChildProcess;
	port: string;
}> {
	return new Promise(async (resolve) => {
		const childProcess = fork(
			path.join("..", "..", "packages", "wrangler", "bin", "wrangler.js"),
			["pages", "dev", "--port=0", "--proxy=9999", ...extraArgs],
			{
				cwd: path.resolve(__dirname, ".."),
				env: { BROWSER: "none", ...process.env },
				stdio: ["ignore", "ignore", "ignore", "ipc"],
			}
		).on("message", (message) => {
			const parsedMessage = JSON.parse(message.toString());
			resolve({
				childProcess,
				port: parsedMessage.port,
			});
		});
		debugger;
	});
}

function terminateChildProcess(childProcess: ChildProcess): Promise<unknown> {
	return new Promise((resolve, reject) => {
		childProcess.once("exit", (code) => {
			if (!code) {
				resolve(code);
			} else {
				reject(code);
			}
		});
		childProcess.kill("SIGTERM");
	});
}

async function waitUntilReady(url: string): Promise<Response> {
	let response: Response | undefined = undefined;

	while (response === undefined) {
		await setTimeout(500);

		try {
			response = await fetch(url);
		} catch (e) {}
	}

	return response as Response;
}
