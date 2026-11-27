import dedent from "ts-dedent";
import { test } from "./helpers";

const unhandledRejectionTest = dedent`
	import { it } from "vitest";
	it("triggers unhandled rejection", async () => {
		// Start a promise that will be rejected; don't chain a rejection handler
		// before yielding so it becomes "unhandled" from workerd's perspective.
		Promise.reject(new Error("expected-unhandled-error"));
		await new Promise<void>((resolve) => setTimeout(resolve, 50));
	});
`;

test(
	"unhandled rejection fails the run by default",
	{ timeout: 45_000 },
	async ({ expect, seed, vitestRun }) => {
		await seed({
			"vitest.config.mts": dedent`
				import { cloudflareTest } from "@cloudflare/vitest-plugin";
				export default {
					plugins: [cloudflareTest({ miniflare: { compatibilityDate: "2025-12-02", compatibilityFlags: ["nodejs_compat"] } })],
					test: { testTimeout: 30_000 }
				};
			`,
			"index.test.ts": unhandledRejectionTest,
		});
		const result = await vitestRun();
		expect(await result.exitCode).not.toBe(0);
		// The unhandled error is printed to stderr by Vitest
		expect(result.stderr).toMatch("expected-unhandled-error");
	}
);

test(
	"onUnhandledError callback is invoked and can suppress unhandled rejections",
	{ timeout: 45_000 },
	async ({ expect, seed, vitestRun }) => {
		await seed({
			"vitest.config.mts": dedent`
				import { cloudflareTest } from "@cloudflare/vitest-plugin";
				export default {
					plugins: [cloudflareTest({ miniflare: { compatibilityDate: "2025-12-02", compatibilityFlags: ["nodejs_compat"] } })],
					test: {
						testTimeout: 30_000,
						onUnhandledError(err) {
							// Errors from workers are serialised plain objects (not Error
							// instances) — match on .message, consistent with standard pools.
							if (err?.message === "expected-unhandled-error") {
								return false;
							}
						},
					},
				};
			`,
			"index.test.ts": unhandledRejectionTest,
		});
		const result = await vitestRun();
		expect(await result.exitCode).toBe(0);
	}
);

test(
	"unhandled rejection after a handler has answered is reported without hanging",
	{ timeout: 45_000 },
	async ({ expect, seed, vitestRun }) => {
		await seed({
			"vitest.config.mts": dedent`
				import { cloudflareTest } from "@cloudflare/vitest-plugin";
				export default {
					plugins: [cloudflareTest({ main: "./index.ts", miniflare: { compatibilityDate: "2025-12-02", compatibilityFlags: ["nodejs_compat"] } })],
					test: { testTimeout: 30_000 }
				};
			`,
			// The runtime cancels the socket when the request ends, so its pending
			// read rejects after the handler has answered. A rejection raised
			// before then, or from `fetch()` or a timer, doesn't reproduce this.
			"index.ts": dedent`
				import { connect } from "cloudflare:sockets";
				export default {
					async fetch() {
						const socket = connect("127.0.0.1:1");
						void socket.readable.getReader().read().catch(() => {
							throw new Error("expected-unhandled-error");
						});
						await socket.opened.catch(() => {});
						return new Response();
					}
				}
			`,
			"index.test.ts": dedent`
				import { SELF } from "cloudflare:test";
				import { it } from "vitest";
				it("sends request", async ({ expect }) => {
					const response = await SELF.fetch("https://example.com");
					expect(response.ok).toBe(true);
				});
			`,
		});
		const result = await vitestRun();
		expect(await result.exitCode).not.toBe(0);
		expect(result.stderr).toMatch("expected-unhandled-error");
	}
);
