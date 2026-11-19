import assert from "node:assert";
import * as fs from "node:fs/promises";
import { get } from "node:http";
import { cloudflare } from "@cloudflare/vite-plugin";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { CoreHeaders, Miniflare } from "miniflare";
import { createServer } from "vite";
import { afterEach, describe, test, vi } from "vitest";
import type { ClientRequest } from "node:http";

describe("deferred import caller lifetime", () => {
	runInTempDir();
	afterEach(() => vi.unstubAllEnvs());

	// https://github.com/cloudflare/workers-sdk/issues/16214
	test.for([
		{ ending: "response completion", outcome: "fulfilled" },
		{ ending: "response completion", outcome: "rejected" },
		{ ending: "client disconnection", outcome: "fulfilled" },
	] as const)(
		"settles a cached import as $outcome after $ending",
		async ({ ending, outcome }, { expect, onTestFinished, skip }) => {
			const disconnect = ending === "client disconnection";
			if (disconnect && process.platform === "win32") {
				// https://github.com/cloudflare/workerd/pull/5062
				skip(
					"workerd does not notify Workers of client disconnection on Windows"
				);
			}
			const runtimeReady = vi.spyOn(Miniflare.prototype, "ready", "get");
			await fs.writeFile(
				"cloudflare.config.ts",
				`export default {
					worker: {
						name: "import-lifetime",
						entrypoint: "./index.js",
						compatibilityDate: "2026-04-01",
						compatibilityFlags: ["enable_request_signal", "request_signal_passthrough"],
					},
				};`
			);
			await fs.writeFile(
				"state.js",
				`export const state = { aborted: false, entered: false, released: false, evaluated: false, settled: "pending" };`
			);
			await fs.writeFile(
				"delayed.js",
				`
				import { state } from "./state.js";
				state.entered = true;
				// Poll in the runner's context; the release request only changes shared state.
				while (!state.released) await new Promise(resolve => setTimeout(resolve, 10));
				state.evaluated = true;
				${outcome === "rejected" ? 'throw new Error("import-lifetime-rejection");' : ""}
				export const value = "loaded";
			`
			);
			await fs.writeFile(
				"index.js",
				`
				import { state } from "./state.js";
				let cached;
				export default {
					async fetch(request) {
						switch (new URL(request.url).pathname) {
							case "/__import-lifetime/kick":
								request.signal.addEventListener("abort", () => { state.aborted = true; });
								cached = import("./delayed.js");
								void cached.then(
									() => { state.settled = "fulfilled"; },
									() => { state.settled = "rejected"; }
								);
								if (${!disconnect}) return new Response("kicked");
								break;
							case "/__import-lifetime/release":
								state.released = true;
								return new Response("released");
							case "/__import-lifetime/state":
								return Response.json(state);
							case "/__import-lifetime/read":
								break;
							default:
								return new Response("ready");
						}
						try {
							return new Response((await cached).value);
						} catch (error) {
							return new Response(error.message, { status: 500 });
						}
					}
				};
			`
			);
			const server = await createServer({
				root: process.cwd(),
				configFile: false,
				logLevel: "silent",
				server: { watch: null },
				plugins: [
					cloudflare({
						inspectorPort: false,
						persistState: false,
						remoteBindings: false,
						types: { generate: false },
					}),
				],
			});
			onTestFinished(() => server.close());
			await server.listen(0);
			const url = server.resolvedUrls?.local[0];
			assert(url);

			function request(pathname: string) {
				return fetch(new URL(`/__import-lifetime/${pathname}`, url), {
					signal: AbortSignal.timeout(5_000),
				});
			}

			let first: ClientRequest | undefined;
			if (disconnect) {
				const runtime = runtimeReady.mock.contexts[0];
				assert(runtime instanceof Miniflare);
				// Connect directly to workerd so the reset affects only this request,
				// without depending on Vite's pooled connection to the runtime.
				first = get(new URL("/__import-lifetime/kick", await runtime.ready), {
					agent: false,
					headers: { [CoreHeaders.ROUTE_OVERRIDE]: "import-lifetime" },
				});
				first.on("error", () => {}); // Resetting the connection produces ECONNRESET.
				first.on("response", (response) => response.resume());
				onTestFinished(() => {
					first?.destroy();
				});
			} else {
				expect(await (await request("kick")).text()).toBe("kicked");
			}
			await vi.waitFor(
				async () => {
					expect(await (await request("state")).json()).toMatchObject({
						entered: true,
						evaluated: false,
						settled: "pending",
					});
				},
				{ timeout: 10_000 }
			);
			if (first) {
				assert(first.socket);
				first.socket.resetAndDestroy();
				await vi.waitFor(
					async () => {
						expect(await (await request("state")).json()).toMatchObject({
							aborted: true,
							evaluated: false,
							settled: "pending",
						});
					},
					{ timeout: 10_000 }
				);
			}
			expect(await (await request("release")).text()).toBe("released");
			await vi.waitFor(
				async () => {
					expect(await (await request("state")).json()).toMatchObject({
						evaluated: true,
					});
				},
				{ timeout: 10_000 }
			);

			const response = await request("read");
			expect(response.status).toBe(outcome === "fulfilled" ? 200 : 500);
			expect(await response.text()).toBe(
				outcome === "fulfilled" ? "loaded" : "import-lifetime-rejection"
			);
			expect(await (await request("state")).json()).toMatchObject({
				settled: outcome,
			});
		}
	);
});
