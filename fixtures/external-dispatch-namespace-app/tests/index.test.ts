import { fork } from "child_process";
import { setTimeout } from "node:timers/promises";
import * as path from "path";
import { fetch } from "undici";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { unstable_dev } from "wrangler";
import type { ChildProcess } from "child_process";
import type { Response, RequestInfo, RequestInit } from "undici";
import type { UnstableDevWorker } from "wrangler";

const waitUntilReady = async (input: RequestInfo, init?: RequestInit): Promise<Response> => {
	let response: Response | undefined = undefined;

	while (response === undefined) {
		await setTimeout(500);

		try {
			response = await fetch(input, init);
		} catch (e) {}
	}

	return response as Response;
};

type WranglerInstance = {
	dirName: string;
	childProcess: ChildProcess;
	ip: string;
	port: string;
};

describe("external-dispatch-namespace-app", () => {
	let dispatchee: UnstableDevWorker;
	let outbound: UnstableDevWorker;
	let dispatcher: UnstableDevWorker;
	let pagesDispatcher: WranglerInstance;

	beforeAll(async () => {
		dispatchee = await unstable_dev(
			path.join(__dirname, "../dispatchee/index.ts"),
			{
				config: path.join(__dirname, "../dispatchee/wrangler.toml"),
			}
		);
		outbound = await unstable_dev(
			path.join(__dirname, "../outbound/index.ts"),
			{
				config: path.join(__dirname, "../outbound/wrangler.toml"),
			}
		);
		dispatcher = await unstable_dev(
			path.join(__dirname, "../dispatcher/index.ts"),
			{
				config: path.join(__dirname, "../dispatcher/wrangler.toml"),
			}
		);
		pagesDispatcher = await getWranglerInstance({
			pages: true,
			dirName: "pages-dispatcher",
			extraArgs: [
				"--dispatch=MY_DISPATCH_NAMESPACE=my-namespace@outbound#parameter1,parameter2",
			],
		});
	});

	afterAll(async () => {
		await Promise.allSettled([
			terminateWranglerInstance(pagesDispatcher),
			dispatcher.stop(),
			outbound.stop(),
			dispatchee.stop(),
		]);
	});

	it("dispatches from a Pages project", async () => {
		const pagesDispatcherResponse = await waitUntilReady(
			`http://127.0.0.1:${pagesDispatcher.port}/`, {
				headers: {
					"x-foo": "bar"
				}
			}
		);
		expect(
			pagesDispatcherResponse.headers.get("parameter1")
		).toMatchInlineSnapshot(`"p1"`);
		expect(
			pagesDispatcherResponse.headers.get("parameter2")
		).toMatchInlineSnapshot(`"p2"`);
		expect(await pagesDispatcherResponse.text()).toMatchInlineSnapshot(
			`"{\"x-foo\":\"bar\"}"`
		);
	});

	it("dispatches from a Worker", async () => {
		const dispatcherResponse = await waitUntilReady(
			`http://127.0.0.1:${dispatcher.port}/`, {
				headers: {
					"x-foo": "bar"
				}
			}
		);
		expect(dispatcherResponse.headers.get("parameter1")).toMatchInlineSnapshot(
			`"p1"`
		);
		expect(dispatcherResponse.headers.get("parameter2")).toMatchInlineSnapshot(
			`"p2"`
		);
		expect(await dispatcherResponse.text()).toMatchInlineSnapshot(
			`"{\"x-foo\":\"bar\"}"`
		);
	});
});

async function getWranglerInstance({
	pages = false,
	dirName,
	extraArgs = [],
}: {
	pages?: boolean;
	dirName: string;
	extraArgs?: string[];
}): Promise<WranglerInstance> {
	return new Promise((resolve) => {
		const childProcess = fork(
			path.join("..", "..", "..", "packages", "wrangler", "bin", "wrangler.js"),
			[
				...(pages ? ["pages"] : []),
				"dev",
				...(pages ? ["public"] : ["index.ts"]),
				"--local",
				`--port=0`,
				...extraArgs,
			],
			{
				cwd: path.resolve(__dirname, "..", dirName),
				env: { BROWSER: "none", ...process.env },
				stdio: ["ignore", "ignore", "ignore", "ipc"],
			}
		).on("message", (message) => {
			const parsedMessage = JSON.parse(message.toString());
			resolve({
				dirName,
				childProcess,
				ip: parsedMessage.ip,
				port: parsedMessage.port,
			});
		});
	});
}

function terminateWranglerInstance({
	childProcess,
}: WranglerInstance): Promise<unknown> {
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
