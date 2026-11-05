import { EventEmitter } from "node:events";
import path from "node:path";
import { runInTempDir, seed } from "@cloudflare/workers-utils/test-helpers";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { DevEnv } from "../../api";
import { ConfigController } from "../../api/startDevWorker/ConfigController";
import { runCfWranglerDev } from "../../cf-wrangler/dev";
import { startDev } from "../../dev/start-dev";
import { FakeBus } from "../helpers/fake-bus";
import { mockConsoleMethods } from "../helpers/mock-console";
import type { StartDevOptions } from "../../dev";

vi.mock("../../api", () => ({ DevEnv: vi.fn() }));

vi.mock("@cloudflare/config", async (importOriginal) => {
	const { createConfigMock } = await import("../helpers/mock-new-config");
	return createConfigMock(importOriginal);
});

describe("cf-wrangler dev persistence", () => {
	runInTempDir();
	mockConsoleMethods();
	let controller: ConfigController;
	let devEnv: EventEmitter;

	beforeEach(() => {
		controller = new ConfigController(new FakeBus());
		devEnv = new EventEmitter();
		const fakeDevEnv = Object.assign(devEnv, {
			config: controller,
			proxy: {
				ready: {
					promise: Promise.resolve({ url: new URL("http://localhost:8787") }),
				},
			},
			teardown: () => controller.teardown(),
		});
		vi.mocked(DevEnv).mockImplementation(function () {
			return fakeDevEnv as unknown as DevEnv;
		});
	});

	afterEach(async () => {
		await controller.teardown();
	});

	it.for([
		{
			name: "cf-wrangler's default state directory",
			entrypoint: "cf-wrangler",
			options: {},
			stateDirectory: ".cloudflare/state",
		},
		{
			name: "Wrangler's default state directory",
			entrypoint: "wrangler",
			options: {},
			stateDirectory: ".wrangler/state",
		},
		{
			name: "an explicit persistence path",
			entrypoint: "cf-wrangler",
			options: { persistTo: "custom-state" },
			stateDirectory: "custom-state",
		},
		{
			name: "disabled persistence",
			entrypoint: "cf-wrangler",
			options: { persist: false },
			stateDirectory: false,
		},
	] as const)(
		"uses $name with cloudflare.config.ts",
		async ({ entrypoint, options: overrides, stateDirectory }, { expect }) => {
			await seed({
				"cloudflare.config.ts": `export default {
				worker: {
					name: "state-worker",
					compatibilityDate: "2026-05-18",
					entrypoint: "./src/index.js",
				},
			};`,
				"wrangler.config.ts": `export default { types: { generate: false } };`,
				"src/index.js": "export default {}",
			});
			const options = {
				experimentalNewConfig: true,
				local: true,
				port: 8787,
				inspectorPort: 9229,
				disableDevRegistry: true,
				showInteractiveDevSession: false,
				...overrides,
			} as StartDevOptions;

			if (entrypoint === "cf-wrangler") {
				options.onReady = () => {
					// Let startup finish before ending the fake session.
					setImmediate(() => devEnv.emit("teardown"));
				};
				await expect(runCfWranglerDev(options)).resolves.toBe(0);
			} else {
				await startDev(options);
			}

			expect(controller.latestConfig?.dev.persist).toBe(
				stateDirectory === false ? false : path.resolve(stateDirectory)
			);
		}
	);
});
