import events from "node:events";
import path from "node:path";
import dedent from "ts-dedent";
import { describe, it } from "vitest";
import { ConfigController } from "../../../api/startDevWorker/ConfigController";
import { unwrapHook } from "../../../api/startDevWorker/utils";
import { logger } from "../../../logger";
import { mockAccountId, mockApiToken } from "../../helpers/mock-account-id";
import { mockConsoleMethods } from "../../helpers/mock-console";
import { runInTempDir } from "../../helpers/run-in-tmp";
import { runWrangler } from "../../helpers/run-wrangler";
import { seed } from "../../helpers/seed";
import type { ConfigUpdateEvent } from "../../../api";

async function waitForConfigUpdate(
	controller: ConfigController
): Promise<ConfigUpdateEvent> {
	const [event] = await events.once(controller, "configUpdate");
	return event;
}

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
	let controller: ConfigController;
	beforeEach(() => {
		controller = new ConfigController();
		logger.loggerLevel = "debug";
	});
	afterEach(async () => {
		logger.debug("tearing down");
		await controller.teardown();
		logger.debug("teardown complete");
		logger.resetLoggerLevel();
	});

	it("should prompt user to update types if they're out of date", async () => {
		await seed({
			"src/index.ts": dedent/* javascript */ `
				export default {}
			`,
			"wrangler.toml": dedent/* toml */ `
				name = "my-worker"
				main = "src/index.ts"
				compatibility_date = \"2024-06-01\"
			`,
		});
		await runWrangler("types");

		const event = waitForConfigUpdate(controller);
		await controller.set({ config: "./wrangler.toml" });
		await event;

		const event2 = waitForConfigUpdate(controller);
		await seed({
			"wrangler.toml": dedent/* toml */ `
				name = "my-worker"
				main = "src/index.ts"
				compatibility_date = \"2025-06-01\"
		    `,
		});
		await event2;

		await vi.waitFor(() => {
			expect(std.out).toContain("Your types might be out of date.");
		});
	});

	it("should use account_id from config file before env var", async () => {
		await seed({
			"src/index.ts": dedent/* javascript */ `
                export default {}
            `,
			"wrangler.toml": dedent/* toml */ `
                name = "my-worker"
                main = "src/index.ts"
				compatibility_date = \"2024-06-01\"
            `,
		});

		const event = waitForConfigUpdate(controller);
		await controller.set({ config: "./wrangler.toml" });

		const { config } = await event;
		await expect(unwrapHook(config.dev.auth)).resolves.toMatchObject({
			accountId: "some-account-id",
			apiToken: { apiToken: "some-api-token" },
		});

		const event2 = waitForConfigUpdate(controller);
		await seed({
			"wrangler.toml": dedent/* toml */ `
                name = "my-worker"
                main = "src/index.ts"
								compatibility_date = \"2024-06-01\"
                account_id = "1234567890"
            `,
		});

		const { config: config2 } = await event2;
		await expect(unwrapHook(config2.dev.auth)).resolves.toMatchObject({
			accountId: "1234567890",
			apiToken: { apiToken: "some-api-token" },
		});
	});

	it("should emit configUpdate events with defaults applied", async () => {
		const event = waitForConfigUpdate(controller);
		await seed({
			"src/index.ts": dedent/* javascript */ `
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

	it("should apply module root to parent if main is nested from base_dir", async () => {
		const event = waitForConfigUpdate(controller);
		await seed({
			"some/base_dir/nested/index.js": dedent/* javascript */ `
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

	it("should shallow merge patched config", async () => {
		const event1 = waitForConfigUpdate(controller);
		await seed({
			"src/index.ts": dedent/* javascript */ `
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

		const event2 = waitForConfigUpdate(controller);
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

		const event3 = waitForConfigUpdate(controller);
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
});
