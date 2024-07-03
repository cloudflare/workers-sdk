import { ChildProcess, fork } from "node:child_process";
import path from "node:path";
import { setTimeout } from "node:timers/promises";
import { fetch, Response } from "undici";
import { describe, expect, it } from "vitest";

describe("Pages dev with proxy and a script file", () => {
	it("should handle requests using a script from the default _worker.js path", async () => {
		const { port, childProcess } = await startWranglerPagesDevProxy();
		let stderr = "";
		childProcess.stderr?.on("data", (chunk) => {
			stderr += chunk.toString();
		});
		const combinedResponse = await waitUntilReady(`http://127.0.0.1:${port}/`);
		const respText = await combinedResponse.text();
		expect(respText).toMatchInlineSnapshot('"hello from _worker.js"');
		expect(
			stderr.includes(
				"Specifying a `-- <command>` or `--proxy` is deprecated and will be removed in a future version of Wrangler."
			)
		).toBeTruthy();
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
			[
				"pages",
				"dev",
				"--ip=127.0.0.1",
				"--port=0",
				"--proxy=9999",
				...extraArgs,
			],
			{
				cwd: path.resolve(__dirname, ".."),
				env: { BROWSER: "none", ...process.env },
				stdio: ["pipe", "pipe", "pipe", "ipc"],
			}
		).on("message", (message) => {
			const parsedMessage = JSON.parse(message.toString());
			resolve({
				childProcess,
				port: parsedMessage.port,
			});
		});
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
