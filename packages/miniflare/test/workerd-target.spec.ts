import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { serializeConfig, unstable_assembleWorkerdConfig } from "miniflare";
import { test } from "vitest";
import workerdPath from "workerd";
import { useTmp } from "./test-shared";

async function getFreePort(): Promise<number> {
	return new Promise((resolve, reject) => {
		const server = net.createServer();
		server.on("error", reject);
		server.listen(0, "127.0.0.1", () => {
			const address = server.address();
			if (address === null || typeof address === "string") {
				reject(new Error("Unable to determine server port"));
				return;
			}
			server.close(() => resolve(address.port));
		});
	});
}

test("workerd target config runs with bare workerd serve", async ({
	expect,
}) => {
	const tmp = await useTmp("workerd-target");
	const persistRoot = path.join(tmp, "state");
	const configPath = path.join(tmp, "config.bin");
	const config = await unstable_assembleWorkerdConfig({
		unsafeWorkerdOutput: true,
		defaultPersistRoot: persistRoot,
		workers: [
			{
				name: "worker",
				compatibilityDate: "2024-01-01",
				modules: [
					{
						type: "ESModule",
						path: "index.mjs",
						contents: `
							export class Counter {
								constructor(state) {
									this.state = state;
								}

								async fetch() {
									const value = (await this.state.storage.get("value")) ?? 0;
									await this.state.storage.put("value", value + 1);
									return new Response(String(value + 1));
								}
							}

							export default {
								async fetch(request, env) {
									const id = env.COUNTER.idFromName("test");
									return env.COUNTER.get(id).fetch(request);
								},
							};
						`,
					},
				],
				durableObjects: {
					COUNTER: "Counter",
				},
			},
		],
	});
	await fs.writeFile(configPath, serializeConfig(config));

	const port = await getFreePort();
	const stderr: string[] = [];
	const child = spawn(
		workerdPath,
		["serve", "--binary", configPath, `--socket-addr=entry=127.0.0.1:${port}`],
		{ cwd: tmp }
	);
	child.stderr.setEncoding("utf8");
	child.stderr.on("data", (chunk) => stderr.push(chunk));

	try {
		const url = `http://127.0.0.1:${port}`;
		let response: globalThis.Response | undefined;
		const deadline = Date.now() + 10_000;
		while (Date.now() < deadline) {
			try {
				response = await fetch(url);
				break;
			} catch {
				await new Promise((resolve) => setTimeout(resolve, 100));
			}
		}

		if (response === undefined) {
			throw new Error(`workerd did not start:\n${stderr.join("")}`);
		}

		expect(response.status).toBe(200);
		expect(await response.text()).toBe("1");
		const second = await fetch(url);
		expect(await second.text()).toBe("2");
	} finally {
		child.kill("SIGTERM");
	}
});
