import { EventEmitter } from "node:events";
import path from "node:path";
import { runInTempDir, seed } from "@cloudflare/workers-utils/test-helpers";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { DevEnv } from "../../api";
import { ConfigController } from "../../api/startDevWorker/ConfigController";
import { parseArgs } from "../../cf-wrangler/args";
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

describe("cf-wrangler dev configuration", () => {
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

	it.for([false, true])(
		"loads explicit env files outside the project (override: %s)",
		async (override, { expect }) => {
			vi.stubEnv("CLOUDFLARE_INCLUDE_PROCESS_ENV", undefined);
			vi.stubEnv("CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV", undefined);
			vi.stubEnv("UNRELATED_SHELL_VARIABLE", "shell-only");
			await seed({
				".env": "EXAMPLE_VALUE=hello\nSHARED_VALUE=shared",
				"apps/example/cloudflare.config.ts": `export default {
					worker: {
						name: "env-file-worker",
						compatibilityDate: "2026-05-18",
						entrypoint: "./src/index.js",
					},
				};`,
				"apps/example/src/index.js": "export default {}",
				"apps/example/.dev.vars":
					"EXAMPLE_VALUE=dev-vars\nDEV_VARS_ONLY=ignored",
				"apps/example/.env": "EXAMPLE_VALUE=project\nPROJECT_ONLY=ignored",
				"apps/example/.env.local": "EXAMPLE_VALUE=override",
			});
			process.chdir("apps/example");
			const options = parseArgs([
				"--local",
				"--env-file",
				"../../.env",
				...(override ? ["--env-file=.env.local"] : []),
			]);
			await runCfWranglerDev({
				...options,
				port: 8787,
				inspectorPort: 9229,
				disableDevRegistry: true,
				showInteractiveDevSession: false,
				onReady() {
					setImmediate(() => devEnv.emit("teardown"));
				},
			});

			expect(controller.latestConfig?.bindings).toEqual({
				EXAMPLE_VALUE: {
					type: "secret_text",
					value: override ? "override" : "hello",
				},
				SHARED_VALUE: { type: "secret_text", value: "shared" },
			});
		}
	);

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
