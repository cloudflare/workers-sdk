import events from "node:events";
import { describe, it } from "vitest";
import { ConfigController } from "../../../api/startDevWorker/ConfigController";
import type { ConfigUpdateEvent, StartDevWorkerOptions } from "../../../api";

async function waitForConfigUpdate(
	controller: ConfigController
): Promise<ConfigUpdateEvent> {
	const [event] = await events.once(controller, "configUpdate");
	return event;
}

describe("ConfigController", () => {
	it("should emit configUpdate events with defaults applied", async () => {
		const controller = new ConfigController();
		const event = waitForConfigUpdate(controller);
		const config: StartDevWorkerOptions = {
			entrypoint: { path: "src/index.ts" },
			directory: "./",
		};

		controller.set(config);

		await expect(event).resolves.toMatchObject({
			type: "configUpdate",
			config: {
				build: {
					additionalModules: [],
					define: {},
					format: "modules",
					moduleRoot: "./",
					moduleRules: [],
				},
				directory: "./",
				entrypoint: {
					path: "src/index.ts",
				},
			},
		});
	});

	it("should shallow merge patched config", async () => {
		const controller = new ConfigController();
		const event1 = waitForConfigUpdate(controller);
		const config: StartDevWorkerOptions = {
			entrypoint: { path: "src/index.ts" },
			directory: "./",
		};

		controller.set(config);

		await expect(event1).resolves.toMatchObject({
			type: "configUpdate",
			config: {
				entrypoint: { path: "src/index.ts" },
				directory: "./",
				build: {
					additionalModules: [],
					define: {},
					format: "modules",
					moduleRoot: "./",
					moduleRules: [],
				},
			},
		});

		const event2 = waitForConfigUpdate(controller);
		controller.patch({
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
				entrypoint: { path: "src/index.ts" },
				directory: "./",
				build: {
					additionalModules: [],
					define: {},
					format: "modules",
					moduleRoot: "./",
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
		controller.patch({
			dev: {
				server: { hostname: "myexample.com" },
			},
		});
		// expect `dev` field to be overwritten and all other config to remain intact
		await expect(event3).resolves.toMatchObject({
			type: "configUpdate",
			config: {
				entrypoint: { path: "src/index.ts" },
				directory: "./",
				build: {
					additionalModules: [],
					define: {},
					format: "modules",
					moduleRoot: "./",
					moduleRules: [],
				},
				dev: {
					server: { hostname: "myexample.com" },
				},
			},
		});
	});
});
