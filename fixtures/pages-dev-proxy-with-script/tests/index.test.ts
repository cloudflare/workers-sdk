import { ChildProcess, fork } from "node:child_process";
import path from "node:path";
import { setTimeout } from "node:timers/promises";
import { fetch, Response } from "undici";
import { describe, it, onTestFinished } from "vitest";
import { runWranglerPagesDev } from "../../shared/src/run-wrangler-long-lived";

describe("Pages dev with proxy and a script file", () => {
	it("should handle requests using a script from the default _worker.js path", async ({
		expect,
	}) => {
		const process = await startWranglerPagesDevProxy();
		const combinedResponse = await waitUntilReady(
			`http://127.0.0.1:${process.port}/`
		);
		const respText = await combinedResponse.text();
		expect(respText).toMatchInlineSnapshot('"hello from _worker.js"');
		expect(
			process
				.getOutput()
				.includes(
					"Specifying a `-- <command>` or `--proxy` is deprecated and will be removed in a future version of Wrangler."
				)
		).toBeTruthy();

		expect(
			process
				.getOutput()
				.includes(
					"On Node.js 17+, wrangler will default to fetching only the IPv6 address. Please ensure that the process listening on the port specified via `--proxy` is configured for IPv6."
				)
		).toBeTruthy();
	});

	it("should handle requests using a script from a custom script path", async ({
		expect,
	}) => {
		const process = await startWranglerPagesDevProxy([
			"--script-path=custom/script/path/index.js",
		]);
		const combinedResponse = await waitUntilReady(
			`http://127.0.0.1:${process.port}/`
		);
		const respText = await combinedResponse.text();
		expect(respText).toMatchInlineSnapshot(
			'"hello from custom/script/path/index.js"'
		);
	});
});

async function startWranglerPagesDevProxy(extraArgs: string[] = []) {
	const process = await runWranglerPagesDev(
		path.resolve(__dirname, ".."),
		undefined,
		["--port=0", "--proxy=9999", ...extraArgs]
	);

	onTestFinished(process.stop);

	return process;
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
