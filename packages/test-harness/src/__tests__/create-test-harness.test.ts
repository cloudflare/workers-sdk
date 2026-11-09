import { maybeStartOrUpdateRemoteProxySession } from "@cloudflare/remote-bindings";
import {
	mockConsoleMethods,
	runInTempDir,
	seed,
} from "@cloudflare/workers-utils/test-helpers";
import { beforeEach, describe, it, onTestFinished, vi } from "vitest";
import { createTestHarness } from "../index";
import type { TestHarnessOptions } from "../index";

// Starting a real session needs Cloudflare credentials
vi.mock("@cloudflare/remote-bindings", () => ({
	maybeStartOrUpdateRemoteProxySession: vi.fn(),
}));

type BuildWorker = {
	config: Record<string, unknown>;
	script?: string;
	assets?: Record<string, string>;
};

/**
 * Writes a project's Build Output, as a build tool would.
 *
 * @param projectDir The project directory
 * @param workers The Workers, keyed by their directory under `workers/`
 * @param mode The mode the build ran in
 */
async function writeBuild(
	projectDir: string,
	workers: Record<string, BuildWorker>,
	mode = "production"
) {
	const outputDir = `${projectDir}/.cloudflare/output/v0`;
	const files: Record<string, string> = {
		[`${outputDir}/config.json`]: JSON.stringify({
			buildContext: { isPreview: false, mode },
		}),
	};
	for (const [directoryName, worker] of Object.entries(workers)) {
		const workerDir = `${outputDir}/workers/${directoryName}`;
		files[`${workerDir}/worker.config.json`] = JSON.stringify({
			compatibilityDate: "2026-10-01",
			...worker.config,
			manifest:
				worker.script === undefined
					? undefined
					: { type: "partial", mainModule: "index.js", modules: {} },
		});
		if (worker.script !== undefined) {
			files[`${workerDir}/bundle/index.js`] = worker.script;
		}
		for (const [name, contents] of Object.entries(worker.assets ?? {})) {
			files[`${workerDir}/assets/${name}`] = contents;
		}
	}
	await seed(files);
}

/**
 * Creates a test harness that's closed when the test finishes.
 *
 * @param options The harness's options
 * @returns The test harness
 */
function useTestHarness(options: TestHarnessOptions) {
	const harness = createTestHarness(options);
	onTestFinished(() => harness.close());
	return harness;
}

describe("createTestHarness()", () => {
	runInTempDir();
	const std = mockConsoleMethods();
	beforeEach(() => {
		vi.mocked(maybeStartOrUpdateRemoteProxySession).mockResolvedValue(null);
	});

	it("runs a build's default Worker and its assets", async ({ expect }) => {
		await writeBuild("app", {
			default: {
				config: {
					name: "app",
					env: { GREETING: { type: "text", value: "Hello" } },
				},
				script: `export default {
					fetch(request, env) {
						return new Response(env.GREETING + " from " + new URL(request.url).pathname);
					},
				};`,
				assets: { "style.css": "body { color: red; }" },
			},
		});
		const harness = useTestHarness({ workers: [{ buildOutput: "app" }] });

		const { url } = await harness.listen();
		expect(url.protocol).toBe("http:");
		expect(await (await harness.fetch("/users")).text()).toBe(
			"Hello from /users"
		);
		expect(await (await harness.fetch("/style.css")).text()).toBe(
			"body { color: red; }"
		);
	});

	it("reads secrets for the build's mode, which the test can override", async ({
		expect,
	}) => {
		await writeBuild(
			"app",
			{
				default: {
					config: {
						name: "app",
						env: {
							TOKEN: { type: "secret" },
							API_KEY: { type: "secret" },
							GREETING: { type: "text", value: "Hello" },
						},
					},
					script: `export default {
						fetch(request, env) {
							const { TOKEN, API_KEY, GREETING, EXTRA } = env;
							return Response.json({ TOKEN, API_KEY, GREETING, EXTRA });
						},
					};`,
				},
			},
			"staging"
		);
		await seed({
			"app/.dev.vars.production": "TOKEN=production\nAPI_KEY=production",
			"app/.dev.vars.staging": "TOKEN=staging",
		});
		const harness = useTestHarness({
			workers: [
				{
					buildOutput: "app",
					secrets: { API_KEY: "from-test" },
					vars: { GREETING: "Hi", EXTRA: { nested: true } },
				},
			],
		});

		expect(await (await harness.fetch("/")).json()).toEqual({
			TOKEN: "staging",
			API_KEY: "from-test",
			GREETING: "Hi",
			EXTRA: { nested: true },
		});
		// API_KEY isn't in the staging file, but the test provides it
		expect(std.warn).toBe("");
	});

	it("runs Workers from several builds, picking non-default ones by name", async ({
		expect,
	}) => {
		await writeBuild("frontend", {
			default: {
				config: {
					name: "frontend",
					env: { API: { type: "worker", worker: "api" } },
				},
				script: `export default {
					async fetch(request, env) {
						return new Response("frontend -> " + (await (await env.API.fetch(request)).text()));
					},
				};`,
			},
		});
		const respondWith = (text: string) =>
			`export default { fetch() { return new Response(${JSON.stringify(text)}); } };`;
		await writeBuild("backend", {
			default: { config: { name: "api" }, script: respondWith("api") },
			// Build tools lowercase the folder name
			admin: { config: { name: "Admin" }, script: respondWith("admin") },
		});

		const harness = useTestHarness({
			workers: [{ buildOutput: "frontend" }, { buildOutput: "backend" }],
		});
		expect(await (await harness.fetch("/")).text()).toBe("frontend -> api");

		const overridden = useTestHarness({
			workers: [
				{ buildOutput: "frontend", bindingOverrides: { API: "Admin" } },
				{ buildOutput: "backend", name: "Admin" },
			],
		});
		expect(await (await overridden.fetch("/")).text()).toBe(
			"frontend -> admin"
		);

		const missing = useTestHarness({
			workers: [{ buildOutput: "backend", name: "missing" }],
		});
		await expect(missing.listen()).rejects.toThrow(
			'No Worker named "missing" in the Build Output'
		);
	});

	it("connects remote bindings through a remote session", async ({
		expect,
	}) => {
		const session = { dispose: vi.fn() };
		vi.mocked(maybeStartOrUpdateRemoteProxySession).mockResolvedValue({
			session,
		} as unknown as Awaited<
			ReturnType<typeof maybeStartOrUpdateRemoteProxySession>
		>);
		const env = { KV: { type: "kv", id: "abc", dev: { remote: true } } };
		await writeBuild("app", {
			default: {
				config: { name: "app", env },
				script: `export default { fetch() { return new Response("ok"); } };`,
			},
		});
		const harness = createTestHarness({ workers: [{ buildOutput: "app" }] });

		await harness.listen();
		expect(maybeStartOrUpdateRemoteProxySession).toHaveBeenCalledWith(
			expect.objectContaining({ name: "app", target: "cf", env }),
			null,
			expect.objectContaining({ hook: expect.any(Function) }),
			expect.objectContaining({ cliDisplayName: "cf" })
		);
		await harness.close();
		expect(session.dispose).toHaveBeenCalled();
	});

	it("disposes the remote session when the runtime fails to start", async ({
		expect,
	}) => {
		const session = { dispose: vi.fn() };
		vi.mocked(maybeStartOrUpdateRemoteProxySession).mockResolvedValue({
			session,
		} as unknown as Awaited<
			ReturnType<typeof maybeStartOrUpdateRemoteProxySession>
		>);
		await writeBuild("app", {
			default: {
				config: { name: "app" },
				script: `export default {`,
			},
		});
		const harness = useTestHarness({ workers: [{ buildOutput: "app" }] });

		await expect(harness.listen()).rejects.toThrow();
		expect(session.dispose).toHaveBeenCalled();
	});

	it("doesn't send a binding the test overrides to the remote session", async ({
		expect,
	}) => {
		await writeBuild("app", {
			default: {
				config: { name: "app", env: { AI: { type: "ai" } } },
				script: `export default {
					async fetch(request, env) {
						return Response.json(await env.AI.run("@cf/test/model", {}));
					},
				};`,
			},
			"mock-ai": {
				config: { name: "mock-ai" },
				script: `import { WorkerEntrypoint } from "cloudflare:workers";
					export default class MockAi extends WorkerEntrypoint {
						run(model) {
							return { model, response: "mock-ai" };
						}
					}`,
			},
		});
		const harness = useTestHarness({
			workers: [
				{ buildOutput: "app", bindingOverrides: { AI: "mock-ai" } },
				{ buildOutput: "app", name: "mock-ai" },
			],
		});

		expect(await (await harness.fetch("/")).json()).toEqual({
			model: "@cf/test/model",
			response: "mock-ai",
		});
		expect(maybeStartOrUpdateRemoteProxySession).toHaveBeenCalledWith(
			expect.objectContaining({
				name: "app",
				env: { AI: { type: "worker", worker: "mock-ai" } },
			}),
			null,
			expect.anything(),
			expect.anything()
		);
	});
});
