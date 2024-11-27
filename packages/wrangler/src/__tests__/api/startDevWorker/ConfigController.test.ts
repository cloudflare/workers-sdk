import events from "node:events";
import path from "node:path";
import dedent from "ts-dedent";
import { describe, it } from "vitest";
import { ConfigController } from "../../../api/startDevWorker/ConfigController";
import { unwrapHook } from "../../../api/startDevWorker/utils";
import { mockAccountId, mockApiToken } from "../../helpers/mock-account-id";
import { mockConsoleMethods } from "../../helpers/mock-console";
import { runInTempDir } from "../../helpers/run-in-tmp";
import { seed } from "../../helpers/seed";
import type { ConfigUpdateEvent, StartDevWorkerInput } from "../../../api";

async function waitForConfigUpdate(
	controller: ConfigController
): Promise<ConfigUpdateEvent> {
	const [event] = await events.once(controller, "configUpdate");
	return event;
}

describe("ConfigController", () => {
	runInTempDir();
	mockConsoleMethods();
	mockAccountId();
	mockApiToken();

	it("should emit configUpdate events with defaults applied", async () => {
		const controller = new ConfigController();
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
		const config: StartDevWorkerInput = {
			entrypoint: "src/index.ts",
		};

		await controller.set(config);

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
		const controller = new ConfigController();
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
base_dir = \"./some/base_dir\"`,
		});

		const config: StartDevWorkerInput = {};

		await controller.set(config);

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
		const controller = new ConfigController();
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
		const config: StartDevWorkerInput = {
			entrypoint: "src/index.ts",
		};

		await controller.set(config);

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

	it("should use account_id from config file before env var", async () => {
		const controller = new ConfigController();
		await seed({
			"src/index.ts": dedent/* javascript */ `
                export default {}
            `,
			"wrangler.toml": dedent/* toml */ `
                name = "my-worker"
                main = "src/index.ts"
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
                account_id = "1234567890"
            `,
		});
		await controller.set({ config: "./wrangler.toml" }); // no file watching during tests

		const { config: config2 } = await event2;
		await expect(unwrapHook(config2.dev.auth)).resolves.toMatchObject({
			accountId: "1234567890",
			apiToken: { apiToken: "some-api-token" },
		});
	});
});
