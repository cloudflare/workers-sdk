import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import path from "node:path";
import { runInTempDir, seed } from "@cloudflare/workers-utils/test-helpers";
import getPort from "get-port";
import { describe, test, vi } from "vitest";
import { DevEnv } from "../../../api/startDevWorker/DevEnv";
import { mockConsoleMethods } from "../../helpers/mock-console";
import type { Worker } from "../../../api/startDevWorker/types";
import type { ChildProcess } from "node:child_process";
import type { Server } from "node:net";

vi.unmock("child_process");
vi.unmock("undici");

const wranglerBin = path.resolve(
	import.meta.dirname,
	"../../../../bin/wrangler.js"
);

async function realGetPort(options?: Parameters<typeof getPort>[0]) {
	const actual = await vi.importActual<typeof import("get-port")>("get-port");
	return actual.default(options);
}

/** Binds `port` on `host`, as another server (such as another `wrangler dev`) would. */
async function listen(port: number, host = "127.0.0.1"): Promise<Server> {
	const server = createServer();
	await new Promise<void>((resolve, reject) => {
		server.once("error", reject);
		server.listen(port, host, resolve);
	});
	return server;
}

async function close(server: Server) {
	await new Promise<void>((resolve) => server.close(() => resolve()));
}

/**
 * Starts a Worker on a free dev server port, with the inspector as given, and
 * waits until it is ready, or rejects with the error the dev session reports.
 */
async function startWorker(
	devEnv: DevEnv,
	inspector?: { port: number }
): Promise<Worker> {
	const failed = new Promise<never>((_, reject) => {
		devEnv.on("error", (error: unknown) => {
			reject(
				error instanceof Error ? error : (error as { cause: unknown }).cause
			);
		});
	});
	const worker = await devEnv.startWorker({
		entrypoint: "index.js",
		compatibilityDate: "2025-01-01",
		dev: {
			server: { hostname: "127.0.0.1", port: 0 },
			inspector,
			persist: false,
		},
	});
	await Promise.race([worker.ready, failed]);
	return worker;
}

type DevProcess = {
	child: ChildProcess;
	output: () => string;
	/** Resolves with whether the process became ready before it exited. */
	started: Promise<boolean>;
};

/** Runs `wrangler dev --port <port>` in `cwd`, as a user would in a terminal. */
function runWranglerDev(cwd: string, port: number): DevProcess {
	const child = spawn(
		process.execPath,
		[wranglerBin, "dev", "--port", String(port)],
		{
			cwd,
			env: {
				...process.env,
				WRANGLER_SEND_METRICS: "false",
				WRANGLER_LOG_PATH: path.join(cwd, "logs"),
			},
			stdio: ["ignore", "pipe", "pipe"],
			// In its own process group, so `stop()` can stop the Wrangler process
			// `bin/wrangler.js` spawns, and its workerd, with it.
			detached: process.platform !== "win32",
		}
	);
	let output = "";
	const started = new Promise<boolean>((resolve) => {
		const onData = (chunk: Buffer) => {
			output += chunk.toString();
			if (output.includes("Ready on")) {
				resolve(true);
			}
		};
		child.stdout?.on("data", onData);
		child.stderr?.on("data", onData);
		child.on("exit", () => resolve(false));
	});
	return { child, output: () => output, started };
}

async function stop({ child }: DevProcess) {
	const exited =
		child.exitCode !== null || child.signalCode !== null
			? Promise.resolve()
			: new Promise((resolve) => child.once("exit", resolve));
	try {
		if (process.platform === "win32") {
			child.kill("SIGKILL");
		} else if (child.pid !== undefined) {
			process.kill(-child.pid, "SIGKILL");
		}
	} catch {
		// The process group has already exited.
	}
	await exited;
}

describe("inspector port (#16964)", () => {
	runInTempDir();
	mockConsoleMethods();

	test("starts when the inspector port it found free is taken before it binds it", async ({
		expect,
		onTestFinished,
	}) => {
		await seed({
			"index.js": `export default { fetch() { return new Response("ok"); } };`,
		});

		// Another `wrangler dev`, started at the same moment, finds the same port
		// free and binds it first, in the window between this session's check and
		// its own bind.
		const taken: Server[] = [];
		onTestFinished(async () => {
			await Promise.all(taken.map(close));
		});
		vi.mocked(getPort).mockImplementation(async (options) => {
			const port = await realGetPort(options);
			taken.push(await listen(port, options?.host));
			return port;
		});
		onTestFinished(() => {
			vi.mocked(getPort).mockImplementation(realGetPort);
		});

		const devEnv = new DevEnv();
		onTestFinished(() => devEnv.teardown().catch(() => {}));
		const worker = await startWorker(devEnv);

		const response = await fetch(await worker.url);
		expect(await response.text()).toBe("ok");
		const inspectorUrl = await worker.inspectorUrl;
		expect(inspectorUrl).toBeDefined();
		const inspectorResponse = await fetch(
			new URL("/json/version", `http://${inspectorUrl?.host}`)
		);
		expect(inspectorResponse.ok).toBe(true);
	});

	test(
		"two `wrangler dev` processes started together, each with its own --port, both start",
		{ timeout: 120_000 },
		async ({ expect }) => {
			for (const name of ["before", "after"]) {
				mkdirSync(name);
				writeFileSync(
					path.join(name, "index.js"),
					`export default { fetch() { return new Response(${JSON.stringify(name)}); } };`
				);
				writeFileSync(
					path.join(name, "wrangler.json"),
					JSON.stringify({
						name,
						main: "index.js",
						compatibility_date: "2025-01-01",
					})
				);
			}

			// As in a before/after benchmark: each round serves both builds side
			// by side, each on its own port, leaving the inspector port to Wrangler.
			for (let round = 0; round < 3; round++) {
				const ports = [await realGetPort(), await realGetPort()];
				const processes = [
					runWranglerDev(path.resolve("before"), ports[0]),
					runWranglerDev(path.resolve("after"), ports[1]),
				];
				try {
					const started = await Promise.all(
						processes.map((devProcess) => devProcess.started)
					);
					for (const [index, devProcess] of processes.entries()) {
						expect(
							started[index],
							`round ${round}, process ${index} output:\n${devProcess.output()}`
						).toBe(true);
					}
					const responses = await Promise.all(
						ports.map((port) =>
							fetch(`http://127.0.0.1:${port}`).then((r) => r.text())
						)
					);
					expect(responses).toEqual(["before", "after"]);
				} finally {
					await Promise.all(processes.map(stop));
				}
			}
		}
	);

	test("names the inspector address and --inspector-port when the inspector port is in use", async ({
		expect,
		onTestFinished,
	}) => {
		await seed({
			"index.js": `export default { fetch() { return new Response("ok"); } };`,
		});
		const port = await realGetPort({ host: "127.0.0.1" });
		const server = await listen(port);
		onTestFinished(() => close(server));

		const devEnv = new DevEnv();
		onTestFinished(() => devEnv.teardown().catch(() => {}));
		const error = await startWorker(devEnv, { port }).then(
			() => undefined,
			(e: unknown) => e
		);

		expect(error).toBeInstanceOf(Error);
		const { message } = error as Error;
		expect(message).toContain("Address already in use");
		expect(message).toContain(`127.0.0.1:${port}`);
		expect(message).toContain("--inspector-port");
	});
});
