import path from "node:path";
import { runInTempDir, seed } from "@cloudflare/workers-utils/test-helpers";
import dedent from "ts-dedent";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { ConfigController } from "../../../api/startDevWorker/ConfigController";
import { unwrapHook } from "../../../api/startDevWorker/utils";
import { logger } from "../../../logger";
import { FakeBus } from "../../helpers/fake-bus";
import { mockAccountId, mockApiToken } from "../../helpers/mock-account-id";
import { mockConsoleMethods } from "../../helpers/mock-console";
import { runWrangler } from "../../helpers/run-wrangler";
import type * as StartDevWorkerApi from "../../../api/startDevWorker";

// Declaration-level pins for the exported input chain: a fresh object
// literal gets excess-property checking, which fails to compile if any of
// these signatures regresses to the base `StartDevWorkerInput` (the
// runtime test below exercises only `ConfigController.set`). Never
// executed.
type StartWorkerInput = Parameters<typeof StartDevWorkerApi.startWorker>[0];
type DevEnvStartInput = Parameters<StartDevWorkerApi.DevEnv["startWorker"]>[0];
type SetConfigInput = Parameters<StartDevWorkerApi.Worker["setConfig"]>[0];
type PatchConfigInput = Parameters<StartDevWorkerApi.Worker["patchConfig"]>[0];
const _publicInputPins: [
	StartWorkerInput,
	DevEnvStartInput,
	SetConfigInput,
	PatchConfigInput,
] = [
	{ entrypoint: "pin.ts", dev: { structuredLogsHandler: () => {} } },
	{ entrypoint: "pin.ts", dev: { structuredLogsHandler: () => {} } },
	{ entrypoint: "pin.ts", dev: { structuredLogsHandler: () => {} } },
	{ dev: { structuredLogsHandler: () => {} } },
];
void _publicInputPins;

describe("ConfigController", () => {
	runInTempDir();
	const std = mockConsoleMethods();
	mockAccountId();
	mockApiToken();

	// We are not using `test.extend` or `onTestFinished` helpers here to create and tear down
	// the controller because these run the teardown after all the `afterEach()` blocks have run.
	// This means that the controller doesn't get torn down until after the temporary directory has been
	// removed.
	// And so the file watchers that the controller creates can randomly fail because they are trying to
	// watch files in a directory that no longer exists.
	// By doing it ourselves in `beforeEach()` and `afterEach()` we can ensure the controller
	// is torn down before the temporary directory is removed.
	let bus: FakeBus;
	let controller: ConfigController;
	beforeEach(() => {
		bus = new FakeBus();
		controller = new ConfigController(bus);
		logger.loggerLevel = "debug";
	});
	afterEach(async () => {
		logger.debug("tearing down");
		await controller.teardown();
		logger.debug("teardown complete");
		logger.resetLoggerLevel();
	});

	it("should prompt user to update types if they're out of date", async ({
		expect,
	}) => {
		await seed({
			"src/index.ts": dedent /* javascript */ `
				export default {}
			`,
			"wrangler.toml": dedent /* toml */ `
				name = "my-worker"
				main = "src/index.ts"
				compatibility_date = \"2024-06-01\"
			`,
		});
		await runWrangler("types");
		await controller.set({ config: "./wrangler.toml" });

		await seed({
			"wrangler.toml": dedent /* toml */ `
				name = "my-worker"
				main = "src/index.ts"
				compatibility_date = \"2025-06-01\"
		    `,
		});
		await controller.set({ config: "./wrangler.toml" });

		await vi.waitFor(() => {
			expect(std.out).toContain("Your types might be out of date.");
		});
	});

	it("should use account_id from config file before env var", async ({
		expect,
	}) => {
		await seed({
			"src/index.ts": dedent /* javascript */ `
                export default {}
            `,
			"wrangler.toml": dedent /* toml */ `
                name = "my-worker"
                main = "src/index.ts"
				compatibility_date = \"2024-06-01\"
            `,
		});

		await controller.set({ config: "./wrangler.toml" });
		await expect(
			unwrapHook(controller.latestConfig?.dev.auth)
		).resolves.toMatchObject({
			accountId: "some-account-id",
			apiToken: { apiToken: "some-api-token" },
		});

		await seed({
			"wrangler.toml": dedent /* toml */ `
                name = "my-worker"
                main = "src/index.ts"
								compatibility_date = \"2024-06-01\"
                account_id = "1234567890"
            `,
		});
		await controller.set({ config: "./wrangler.toml" });
		await expect(
			unwrapHook(controller.latestConfig?.dev.auth)
		).resolves.toMatchObject({
			accountId: "1234567890",
			apiToken: { apiToken: "some-api-token" },
		});
	});

	it("should emit configUpdate events with defaults applied", async ({
		expect,
	}) => {
		const event = bus.waitFor("configUpdate");
		await seed({
			"src/index.ts": dedent /* javascript */ `
				export default {
					fetch(request, env, ctx) {
						return new Response("hello world")
					}
				} satisfies ExportedHandler
			`,
		});

		await controller.set({
			entrypoint: "src/index.ts",
		});

		await expect(event).resolves.toMatchObject({
			type: "configUpdate",
			config: {
				build: {
					additionalModules: [],
					define: {},
					format: "modules",
					moduleRoot: path.join(process.cwd(), "src"),
					moduleRules: [],
				},
				projectRoot: process.cwd(),
				entrypoint: path.join(process.cwd(), "src/index.ts"),
			},
		});
	});

	it("should accept wrangler-specific dev fields through the public input", async ({
		expect,
	}) => {
		const event = bus.waitFor("configUpdate");
		await seed({
			"src/index.ts": dedent /* javascript */ `
				export default {
					fetch(request, env, ctx) {
						return new Response("hello world")
					}
				} satisfies ExportedHandler
			`,
		});

		// Would not compile against the base `StartDevWorkerInput`: the
		// wrangler-specific dev fields live on `WranglerStartDevWorkerInput`,
		// which is the public input type `set()` (and `startWorker`) accept.
		const structuredLogsHandler = () => {};
		await controller.set({
			entrypoint: "src/index.ts",
			dev: { structuredLogsHandler },
		});

		const { config } = await event;
		expect(config.dev?.structuredLogsHandler).toBe(structuredLogsHandler);
	});

	it("should derive nodejsCompatMode from the config like the CLI", async ({
		expect,
	}) => {
		await seed({
			"src/index.ts": dedent /* javascript */ `
				export default {
					fetch(request, env, ctx) {
						return new Response("hello world")
					}
				} satisfies ExportedHandler
			`,
			"wrangler.toml": dedent /* toml */ `
				name = "nodejs-compat-worker"
				main = "src/index.ts"
				compatibility_date = "2026-06-01"
				compatibility_flags = ["nodejs_compat"]
			`,
		});

		// Unset: derived from the resolved config's date + flags.
		const derived = bus.waitFor("configUpdate");
		await controller.set({ config: "./wrangler.toml" });
		await expect(derived).resolves.toMatchObject({
			config: { build: { nodejsCompatMode: "v2" } },
		});

		// Input-level overrides win over the config file, like the CLI's
		// `args.* ?? parsedConfig.*`: a programmatic worker passing the
		// flag without a config-file entry still gets the mode.
		await seed({
			"wrangler-no-flag.toml": dedent /* toml */ `
				name = "nodejs-compat-worker"
				main = "src/index.ts"
				compatibility_date = "2026-06-01"
			`,
		});
		const overridden = bus.waitFor("configUpdate");
		await controller.set({
			config: "./wrangler-no-flag.toml",
			compatibilityFlags: ["nodejs_compat"],
		});
		await expect(overridden).resolves.toMatchObject({
			config: { build: { nodejsCompatMode: "v2" } },
		});

		// Explicit null still disables (callers owning the mode keep it).
		const disabled = bus.waitFor("configUpdate");
		await controller.set({
			config: "./wrangler.toml",
			build: { nodejsCompatMode: null },
		});
		const disabledEvent = await disabled;
		expect(disabledEvent.config.build.nodejsCompatMode).toBeNull();
	});

	it("should apply module root to parent if main is nested from base_dir", async ({
		expect,
	}) => {
		const event = bus.waitFor("configUpdate");
		await seed({
			"some/base_dir/nested/index.js": dedent /* javascript */ `
				export default {
					fetch(request, env, ctx) {
						return new Response("hello world")
					}
				}
			`,
			"wrangler.toml": dedent`
				main = \"./some/base_dir/nested/index.js\"
				compatibility_date = \"2024-06-01\"
				base_dir = \"./some/base_dir\"`,
		});

		await controller.set({});

		await expect(event).resolves.toMatchObject({
			type: "configUpdate",
			config: {
				build: {
					additionalModules: [],
					define: {},
					format: "modules",
					moduleRoot: path.join(process.cwd(), "./some/base_dir"),
					moduleRules: [],
				},
				projectRoot: process.cwd(),
				entrypoint: path.join(process.cwd(), "./some/base_dir/nested/index.js"),
			},
		});
	});

	it("should shallow merge patched config", async ({ expect }) => {
		const event1 = bus.waitFor("configUpdate");
		await seed({
			"src/index.ts": dedent /* javascript */ `
				export default {
					fetch(request, env, ctx) {
						return new Response("hello world")
					}
				} satisfies ExportedHandler
			`,
		});

		await controller.set({
			entrypoint: "src/index.ts",
		});

		await expect(event1).resolves.toMatchObject({
			type: "configUpdate",
			config: {
				entrypoint: path.join(process.cwd(), "src/index.ts"),
				projectRoot: process.cwd(),
				build: {
					additionalModules: [],
					define: {},
					format: "modules",
					moduleRoot: path.join(process.cwd(), "src"),
					moduleRules: [],
				},
			},
		});

		const event2 = bus.waitFor("configUpdate");
		await controller.patch({
			dev: {
				remote: true,
				liveReload: true,
				server: { port: 1234 },
			},
		});
		// expect `dev` field to be added and all other config to remain intact
		await expect(event2).resolves.toMatchObject({
			type: "configUpdate",
			config: {
				entrypoint: path.join(process.cwd(), "src/index.ts"),
				projectRoot: process.cwd(),
				build: {
					additionalModules: [],
					define: {},
					format: "modules",
					moduleRoot: path.join(process.cwd(), "src"),
					moduleRules: [],
				},
				dev: {
					remote: true,
					liveReload: true,
					server: { port: 1234 },
				},
			},
		});

		const event3 = bus.waitFor("configUpdate");
		await controller.patch({
			dev: {
				origin: { hostname: "myexample.com" },
			},
			build: {
				alias: { foo: "bar" },
			},
		});
		// expect `dev` and `build.alias` fields to be overwritten and all other config to remain intact
		await expect(event3).resolves.toMatchObject({
			type: "configUpdate",
			config: {
				entrypoint: path.join(process.cwd(), "src/index.ts"),
				projectRoot: process.cwd(),
				build: {
					alias: {
						foo: "bar",
					},
					additionalModules: [],
					define: {},
					format: "modules",
					moduleRoot: path.join(process.cwd(), "src"),
					moduleRules: [],
				},
				dev: {
					origin: { hostname: "myexample.com" },
				},
			},
		});
	});

	it("should only log warnings once even with multiple config updates", async ({
		expect,
	}) => {
		await seed({
			"src/index.js": dedent /* javascript */ `
				addEventListener('fetch', event => {
					event.respondWith(new Response('hello world'))
				})
			`,
			"wrangler.toml": dedent /* toml */ `
				name = "my-worker"
				main = "src/index.js"
				compatibility_date = "2024-06-01"

				[[analytics_engine_datasets]]
				binding = "ANALYTICS"
				dataset = "analytics_dataset"
			`,
		});

		const event1 = bus.waitFor("configUpdate");
		await controller.set({
			config: "./wrangler.toml",
		});
		await event1;

		const event2 = bus.waitFor("configUpdate");
		await controller.patch({
			dev: { liveReload: true },
		});
		await event2;

		const event3 = bus.waitFor("configUpdate");
		await controller.patch({
			dev: { server: { port: 8787 } },
		});
		await event3;

		const warningCount = std.warn
			.split("\n")
			.filter((line) =>
				line.includes(
					"Analytics Engine is not supported locally when using the service-worker format"
				)
			).length;

		expect(warningCount).toBe(1);
	});

	it("should warn when queues are configured in remote dev mode", async ({
		expect,
	}) => {
		await seed({
			"src/index.ts": dedent /* javascript */ `
				export default {
					fetch() {
						return new Response("hello world")
					}
				}
			`,
			"wrangler.toml": dedent /* toml */ `
				name = "my-worker"
				main = "src/index.ts"
				compatibility_date = "2024-06-01"

				[[queues.producers]]
				binding = "QUEUE"
				queue = "test-queue"
			`,
		});

		const event = bus.waitFor("configUpdate");
		await controller.set({
			config: "./wrangler.toml",
			dev: {
				remote: true,
				auth: {
					accountId: "some-account-id",
					apiToken: { apiToken: "some-api-token" },
				},
			},
		});
		await event;

		expect(std.warn).toContain(
			"Queues are not yet supported in wrangler dev remote mode."
		);
	});
});
