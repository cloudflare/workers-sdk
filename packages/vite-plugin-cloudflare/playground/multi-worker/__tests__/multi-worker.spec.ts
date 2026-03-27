import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { describe, test } from "vitest";
import {
	getJsonResponse,
	isBuild,
	page,
	rootDir,
	viteTestUrl,
} from "../../__test-utils__";

describe.runIf(isBuild)("output directories", () => {
	test("creates the correct output directories", ({ expect }) => {
		expect(fs.existsSync(path.join(rootDir, "dist", "worker_a"))).toBe(true);
		expect(fs.existsSync(path.join(rootDir, "dist", "worker_b"))).toBe(true);
	});

	test("does not include unwanted files in deployment bundle", async ({
		expect,
	}) => {
		const output = execSync("pnpm wrangler deploy --dry-run", {
			cwd: rootDir,
			encoding: "utf8",
		});
		// There should be no additional modules, in particular ones in `.wrangler/tmp`.
		expect(output).not.toContain("Attaching additional modules");
	});
});

describe("multi-worker basic functionality", async () => {
	test("entry worker returns a response", async ({ expect }) => {
		const result = await getJsonResponse();
		expect(result).toEqual({ name: "Worker A" });
	});
});

describe("multi-worker service bindings", async () => {
	test("returns a response from another worker", async ({ expect }) => {
		const result = await getJsonResponse("/fetch");
		expect(result).toEqual({ result: { name: "Worker B" } });
	});

	test.runIf(!isBuild)(
		"proxies WebSocket upgrades through another worker service binding in dev",
		async ({ expect }) => {
			await page.goto(viteTestUrl);
			const message = await page.evaluate(async () => {
				const url = new URL("/websocket-proxy", window.location.href);
				url.protocol = window.location.protocol === "https:" ? "wss:" : "ws:";

				return await new Promise<string>((resolve, reject) => {
					const websocket = new WebSocket(url);
					let settled = false;
					const timer = window.setTimeout(() => {
						if (settled) return;
						settled = true;
						websocket.close();
						reject(new Error("Timed out waiting for proxied WebSocket message"));
					}, 10_000);

					const finish = (fn: () => void) => {
						if (settled) return;
						settled = true;
						window.clearTimeout(timer);
						fn();
					};

					websocket.addEventListener("open", () => {
						websocket.send("ping");
					});
					websocket.addEventListener("message", (event) => {
						finish(() => {
							websocket.close();
							resolve(String(event.data));
						});
					});
					websocket.addEventListener("error", () => {
						finish(() => reject(new Error("WebSocket error")));
					});
					websocket.addEventListener("close", (event) => {
						if (event.wasClean || settled) return;
						finish(() =>
							reject(
								new Error(
									`WebSocket closed before message (${event.code}: ${event.reason})`
								)
							)
						);
					});
				});
			});

			expect(message).toBe("pong from worker-b");
		}
	);

	test("calls an RPC method on another worker", async ({ expect }) => {
		const result = await getJsonResponse("/rpc-method");
		expect(result).toEqual({ result: 9 });
	});

	test("promise pipelining on default entrypoint", async ({ expect }) => {
		const result = await getJsonResponse("/rpc-method/promise-pipelining");
		expect(result).toEqual({ result: "You made it! 🎉" });
	});

	test("calls an RPC getter on another worker", async ({ expect }) => {
		const result = await getJsonResponse("/rpc-getter");
		expect(result).toEqual({ result: "Cloudflare" });
	});

	test("calls an RPC method on a named entrypoint", async ({ expect }) => {
		const result = await getJsonResponse("/rpc-named-entrypoint");
		expect(result).toEqual({ result: 20 });
	});

	test("promise pipelining on a named entrypoint", async ({ expect }) => {
		const result = await getJsonResponse(
			"/rpc-named-entrypoint/promise-pipelining"
		);
		expect(result).toEqual({ result: "You made it! 🚀" });
	});
});
