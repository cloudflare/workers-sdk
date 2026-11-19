import assert from "node:assert";
import * as fs from "node:fs/promises";
import { cloudflare } from "@cloudflare/vite-plugin";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { createServer } from "vite";
import { afterEach, describe, test, vi } from "vitest";

describe("deferred import caller lifetime", () => {
	runInTempDir();
	afterEach(() => vi.unstubAllEnvs());

	// https://github.com/cloudflare/workers-sdk/issues/16214
	test.for(["fulfilled", "rejected"] as const)(
		"settles a cached import as %s after its first response completes",
		async (outcome, { expect, onTestFinished }) => {
			await fs.writeFile(
				"state.js",
				`export const state = { entered: false, released: false, evaluated: false, settled: "pending" };`
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
								cached = import("./delayed.js");
								void cached.then(
									() => { state.settled = "fulfilled"; },
									() => { state.settled = "rejected"; }
								);
								return new Response("kicked");
							case "/__import-lifetime/release":
								state.released = true;
								return new Response("released");
							case "/__import-lifetime/state":
								return Response.json(state);
							case "/__import-lifetime/read":
								try {
									return new Response((await cached).value);
								} catch (error) {
									return new Response(error.message, { status: 500 });
								}
							default:
								return new Response("ready");
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
						config: {
							name: "import-lifetime",
							entrypoint: "./index.js",
							compatibilityDate: "2026-04-01",
						},
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

			expect(await (await request("kick")).text()).toBe("kicked");
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
