import net from "node:net";
import dedent from "ts-dedent";
import { test, vitestConfig } from "./helpers";

/**
 * Try to create a server that blocks a specific port.
 * Returns the server if successful, or null if the port is already in use.
 * This is useful for tests where we want to ensure a port is unavailable -
 * if the port is already in use by another process, that's also fine.
 */
function tryBlockPort(port: number): Promise<net.Server | null> {
	return new Promise((resolve) => {
		const server = net.createServer();
		server.listen(port, () => resolve(server));
		server.on("error", (err: NodeJS.ErrnoException) => {
			if (err.code === "EADDRINUSE") {
				// Port is already in use - that's fine for our test purposes
				resolve(null);
			} else {
				// Unexpected error - still resolve null but log it
				console.error("Unexpected error blocking port:", err);
				resolve(null);
			}
		});
	});
}

/**
 * Create a server on an ephemeral port (OS-assigned).
 * Returns the server and the port it's listening on.
 */
function createEphemeralServer(): Promise<{
	server: net.Server;
	port: number;
}> {
	return new Promise((resolve, reject) => {
		const server = net.createServer();
		server.listen(0, () => {
			const address = server.address();
			if (address && typeof address === "object") {
				resolve({ server, port: address.port });
			} else {
				reject(new Error("Failed to get server address"));
			}
		});
		server.on("error", reject);
	});
}

test("opens an inspector with the `--inspect` argument", async ({
	expect,
	seed,
	vitestRun,
}) => {
	await seed({
		"vitest.config.mts": vitestConfig({
			main: "./index.ts",
			miniflare: {
				compatibilityDate: "2025-12-02",
				compatibilityFlags: ["nodejs_compat"],
			},
		}),
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

	expect(result.stdout).toMatch("inspector on port");
});

test("customize inspector config", async ({ expect, seed, vitestRun }) => {
	await seed({
		"vitest.config.mts": vitestConfig(
			{
				main: "./index.ts",
				miniflare: {
					compatibilityDate: "2025-12-02",
					compatibilityFlags: ["nodejs_compat"],
				},
			},
			{ inspector: { port: 3456 } }
		),
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
		flags: ["--inspect-brk", "--no-file-parallelism"],
	});

	expect(result.stdout).toMatch("inspector on port 3456");
});

test("uses next available port when default port 9229 is in use", async ({
	expect,
	seed,
	vitestRun,
}) => {
	const blockingServer = await tryBlockPort(9229);
	try {
		await seed({
			"vitest.config.mts": vitestConfig({
				main: "./index.ts",
				miniflare: {
					compatibilityDate: "2025-12-02",
					compatibilityFlags: ["nodejs_compat"],
				},
			}),
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

		// Parse the fallback port from the warning message
		const warningMatch = result.stdout.match(
			/Default inspector port 9229 not available, using (\d+) instead/
		);
		expect(warningMatch).toBeTruthy();
		const fallbackPort = warningMatch ? parseInt(warningMatch[1], 10) : 0;

		// Parse the port from the "inspector on port X" message
		const inspectorMatch = result.stdout.match(/inspector on port (\d+)/);
		expect(inspectorMatch).toBeTruthy();
		const inspectorPort = inspectorMatch ? parseInt(inspectorMatch[1], 10) : 0;

		// Verify the fallback port is consistent and not the default port
		expect(fallbackPort).toBe(inspectorPort);
		expect(fallbackPort).not.toBe(9229);
		expect(fallbackPort).toBeGreaterThan(0);
	} finally {
		blockingServer?.close();
	}
});

test("throws error when user-specified inspector port is not available", async ({
	expect,
	seed,
	vitestRun,
}) => {
	// Create a server on an ephemeral port to guarantee we have a port that's in use.
	// This avoids hardcoding a port that might already be in use by another process.
	const { server: blockingServer, port: blockedPort } =
		await createEphemeralServer();
	try {
		await seed({
			"vitest.config.mts": vitestConfig(
				{
					main: "./index.ts",
					singleWorker: true,
					miniflare: {
						compatibilityDate: "2025-12-02",
						compatibilityFlags: ["nodejs_compat"],
					},
				},
				{
					inspector: {
						port: blockedPort,
					},
				}
			),
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
		expect(result.stderr).toMatch(
			`Inspector port ${blockedPort} is not available`
		);
	} finally {
		blockingServer.close();
	}
});
