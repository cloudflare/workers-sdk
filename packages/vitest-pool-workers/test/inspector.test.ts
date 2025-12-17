import net from "node:net";
import dedent from "ts-dedent";
import { test, waitFor } from "./helpers";

function createBlockingServer(port: number): Promise<net.Server> {
	return new Promise((resolve, reject) => {
		const server = net.createServer();
		server.listen(port, () => resolve(server));
		server.on("error", reject);
	});
}

test("opens an inspector with the `--inspect` argument", async ({
	expect,
	seed,
	vitestDev,
}) => {
	await seed({
		"vitest.config.mts": dedent`
			import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";
			export default defineWorkersConfig({
				test: {
					poolOptions: {
						workers: {
							main: "./index.ts",
							singleWorker: true,
							miniflare: {
								compatibilityDate: "2024-01-01",
								compatibilityFlags: ["nodejs_compat"],
							},
						},
					},
				}
			});
		`,
		"index.ts": dedent`
			export default {
				async fetch(request, env, ctx) {
					return new Response("hello world");
				}
			}
		`,
		"index.test.ts": dedent`
			import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
			import { it, expect } from "vitest";
			import worker from "./index";
			it("sends request", async () => {
				const request = new Request("https://example.com");
				const ctx = createExecutionContext();
				const response = await worker.fetch(request, env, ctx);
				await waitOnExecutionContext(ctx);
				expect(await response.text()).toBe("hello world");
			});
		`,
	});
	const result = vitestDev({
		flags: ["--inspect", "--no-file-parallelism"],
	});

	await waitFor(() => {
		expect(result.stdout).toMatch("inspector on port 9229");
	});
});

test("customize inspector config", async ({ expect, seed, vitestDev }) => {
	await seed({
		"vitest.config.mts": dedent`
			import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";
			export default defineWorkersConfig({
				test: {
					inspector: {
						// Test if this overrides the inspector port
						port: 3456,
					},
					poolOptions: {
						workers: {
							main: "./index.ts",
							// Test if we warn and override the singleWorker option when the inspector is open
							singleWorker: false,
							miniflare: {
								compatibilityDate: "2024-01-01",
								compatibilityFlags: ["nodejs_compat"],
							},
						},
					},
				}
			});
		`,
		"index.ts": dedent`
			export default {
				async fetch(request, env, ctx) {
					return new Response("hello world");
				}
			}
		`,
		"index.test.ts": dedent`
			import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
			import { it, expect } from "vitest";
			import worker from "./index";
			it("sends request", async () => {
				const request = new Request("https://example.com");
				const ctx = createExecutionContext();
				const response = await worker.fetch(request, env, ctx);
				await waitOnExecutionContext(ctx);
				expect(await response.text()).toBe("hello world");
			});
		`,
	});
	const result = vitestDev({
		// Test if we warn and ignore the `waitForDebugger` option
		flags: ["--inspect-brk", "--no-file-parallelism"],
	});

	await waitFor(() => {
		expect(result.stdout).toMatch(
			"Tests run in singleWorker mode when the inspector is open."
		);
		expect(result.stdout).toMatch(`The "--inspect-brk" flag is not supported.`);
		expect(result.stdout).toMatch("Starting single runtime");
		expect(result.stdout).toMatch("inspector on port 3456");
	});
});

test("uses next available port when default port 9229 is in use", async ({
	expect,
	seed,
	vitestDev,
}) => {
	const blockingServer = await createBlockingServer(9229);
	try {
		await seed({
			"vitest.config.mts": dedent`
				import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";
				export default defineWorkersConfig({
					test: {
						poolOptions: {
							workers: {
								main: "./index.ts",
								singleWorker: true,
								miniflare: {
									compatibilityDate: "2024-01-01",
									compatibilityFlags: ["nodejs_compat"],
								},
							},
						},
					}
				});
			`,
			"index.ts": dedent`
				export default {
					async fetch(request, env, ctx) {
						return new Response("hello world");
					}
				}
			`,
			"index.test.ts": dedent`
				import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
				import { it, expect } from "vitest";
				import worker from "./index";
				it("sends request", async () => {
					const request = new Request("https://example.com");
					const ctx = createExecutionContext();
					const response = await worker.fetch(request, env, ctx);
					await waitOnExecutionContext(ctx);
					expect(await response.text()).toBe("hello world");
				});
			`,
		});
		const result = vitestDev({
			flags: ["--inspect", "--no-file-parallelism"],
		});

		await waitFor(() => {
			expect(result.stdout).toMatch(
				"Default inspector port 9229 not available, using"
			);
			expect(result.stdout).not.toMatch("inspector on port 9229");
		});
	} finally {
		blockingServer.close();
	}
});

test("throws error when user-specified inspector port is not available", async ({
	expect,
	seed,
	vitestRun,
}) => {
	const blockingServer = await createBlockingServer(3456);
	try {
		await seed({
			"vitest.config.mts": dedent`
				import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";
				export default defineWorkersConfig({
					test: {
						inspector: {
							port: 3456,
						},
						poolOptions: {
							workers: {
								main: "./index.ts",
								singleWorker: true,
								miniflare: {
									compatibilityDate: "2024-01-01",
									compatibilityFlags: ["nodejs_compat"],
								},
							},
						},
					}
				});
			`,
			"index.ts": dedent`
				export default {
					async fetch(request, env, ctx) {
						return new Response("hello world");
					}
				}
			`,
			"index.test.ts": dedent`
				import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
				import { it, expect } from "vitest";
				import worker from "./index";
				it("sends request", async () => {
					const request = new Request("https://example.com");
					const ctx = createExecutionContext();
					const response = await worker.fetch(request, env, ctx);
					await waitOnExecutionContext(ctx);
					expect(await response.text()).toBe("hello world");
				});
			`,
		});
		const result = await vitestRun({
			flags: ["--inspect", "--no-file-parallelism"],
		});

		expect(result.exitCode).not.toBe(0);
		expect(result.stderr).toMatch("Inspector port 3456 is not available");
	} finally {
		blockingServer.close();
	}
});
