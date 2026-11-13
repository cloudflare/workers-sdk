import dedent from "ts-dedent";
import { test } from "./helpers";

// https://github.com/cloudflare/workers-sdk/issues/16168
//
// Each test file's Miniflare instance listens on a local port, which serves
// the Worker under test. Anything else on the machine can reach that port as
// soon as it opens, before Vitest has started the file in workerd. This config
// stands in for such a process: it sends one plain `GET /` to each instance's
// URL once Miniflare reports it ready, before the pool connects to the runner.
const strayRequestConfig = dedent /* javascript */ `
	import path from "node:path";
	import { createRequire } from "node:module";
	import { pathToFileURL } from "node:url";
	import { cloudflareTest } from "@cloudflare/vitest-plugin";

	// Load the same Miniflare module the plugin uses
	const pluginRequire = createRequire(
		path.join(process.cwd(), "node_modules/@cloudflare/vitest-plugin/package.json")
	);
	const { Miniflare } = await import(
		pathToFileURL(pluginRequire.resolve("miniflare")).href
	);
	const ready = Object.getOwnPropertyDescriptor(Miniflare.prototype, "ready");
	const requested = new WeakSet();
	Object.defineProperty(Miniflare.prototype, "ready", {
		configurable: true,
		get() {
			const promise = ready.get.call(this);
			if (requested.has(this)) {
				return promise;
			}
			requested.add(this);
			return promise.then(async (url) => {
				const response = await fetch(url);
				await response.arrayBuffer();
				console.log("stray request answered with " + response.status);
				return url;
			});
		},
	});

	export default {
		plugins: [
			cloudflareTest({
				main: "./worker.ts",
				miniflare: {
					compatibilityDate: "2025-12-02",
					compatibilityFlags: ["nodejs_compat"],
				},
			}),
		],
		test: { testTimeout: 30_000 },
	};
`;

test(
	"a request to the runner's local port before the file starts does not log an uncaught assertion",
	{ timeout: 60_000 },
	async ({ expect, seed, vitestRun }) => {
		await seed({
			"vitest.config.mts": strayRequestConfig,
			"worker.ts": dedent`
				export default {
					fetch() {
						return new Response("body");
					},
				};
			`,
			"index.test.ts": dedent`
				import { exports } from "cloudflare:workers";
				import { it } from "vitest";
				it("fetches the main Worker", async ({ expect }) => {
					const response = await exports.default.fetch("https://example.com/");
					expect(await response.text()).toBe("body");
				});
			`,
		});

		const result = await vitestRun();
		const output = result.stdout + result.stderr;

		// The stray request was sent, and the tests themselves pass
		expect(output).toMatch("stray request answered with");
		expect(output).toMatch(/Tests\s+1 passed/);
		expect(await result.exitCode).toBe(0);

		// ...but the runner must not crash on the stray request with an internal
		// assertion that workerd reports as an uncaught exception
		expect(output).not.toMatch("Expected global Vitest state");
		expect(output).not.toMatch("uncaught exception");
	}
);
