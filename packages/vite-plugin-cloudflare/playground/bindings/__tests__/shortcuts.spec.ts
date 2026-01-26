import path from "node:path";
import { stripVTControlCharacters } from "node:util";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import {
	resetServerLogs,
	satisfiesViteVersion,
	serverLogs,
	viteServer,
} from "../../__test-utils__";
import { PluginContext } from "../../../src/context";
import { resolvePluginConfig } from "../../../src/plugin-config";
import { addBindingsShortcut } from "../../../src/plugins/shortcuts";

const normalize = (logs: string[]) =>
	stripVTControlCharacters(logs.join("\n"))
		.split("\n")
		.map((line: string) => line.trim())
		.join("\n");

describe.skipIf(!satisfiesViteVersion("7.2.7"))("shortcuts", () => {
	beforeAll(() => {
		vi.stubEnv("CI", undefined);
		process.stdin.isTTY = true;
	});

	afterAll(() => {
		vi.unstubAllEnvs();
		process.stdin.isTTY = false;
	});

	test("display binding shortcut hint", () => {
		// Set up the shortcut wrapper (after stubs are in place from beforeAll)
		const mockContext = new PluginContext({
			hasShownWorkerConfigWarnings: false,
			isRestartingDevServer: false,
		});
		mockContext.setResolvedPluginConfig(
			resolvePluginConfig(
				{
					configPath: path.resolve(__dirname, "../wrangler.jsonc"),
				},
				{},
				{
					command: "serve",
					mode: "development",
				}
			)
		);
		addBindingsShortcut(viteServer, mockContext);

		resetServerLogs();
		viteServer.bindCLIShortcuts();

		expect(normalize(serverLogs.info)).not.toMatch(
			"press b + enter to list configured Cloudflare bindings"
		);

		viteServer.bindCLIShortcuts({
			print: true,
		});

		expect(normalize(serverLogs.info)).toMatch(
			"press b + enter to list configured Cloudflare bindings"
		);
	});
	test("prints bindings with a single Worker", () => {
		// Create a test server with a spy on bindCLIShortcuts
		const mockBindCLIShortcuts = vi.spyOn(viteServer, "bindCLIShortcuts");
		// Create mock plugin context
		const mockContext = new PluginContext({
			hasShownWorkerConfigWarnings: false,
			isRestartingDevServer: false,
		});

		mockContext.setResolvedPluginConfig(
			resolvePluginConfig(
				{
					configPath: path.resolve(__dirname, "../wrangler.jsonc"),
				},
				{},
				{
					command: "serve",
					mode: "development",
				}
			)
		);

		addBindingsShortcut(viteServer, mockContext);
		// Confirm that addBindingsShortcut wrapped the original method
		expect(viteServer.bindCLIShortcuts).not.toBe(mockBindCLIShortcuts);
		expect(mockBindCLIShortcuts).toHaveBeenCalledExactlyOnceWith({
			customShortcuts: [
				{
					key: "b",
					description: "list configured Cloudflare bindings",
					action: expect.any(Function),
				},
			],
		});

		const { customShortcuts } = mockBindCLIShortcuts.mock.calls[0]?.[0] ?? {};
		const printBindingShortcut = customShortcuts?.find((s) => s.key === "b");

		resetServerLogs();
		// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-floating-promises
		printBindingShortcut?.action?.(viteServer as any);

		expect(normalize(serverLogs.info)).toMatchInlineSnapshot(`
			"
			Your Worker has access to the following bindings:
			Binding                                    Resource
			env.KV (test-kv-id)                        KV Namespace
			env.HYPERDRIVE (test-hyperdrive-id)        Hyperdrive Config
			env.HELLO_WORLD (Timer disabled)           Hello World
			env.WAE (test)                             Analytics Engine Dataset
			env.IMAGES                                 Images
			env.RATE_LIMITER (ratelimit)               Unsafe Metadata
			"
		`);
	});

	test("prints bindings with multi Workers", () => {
		// Create a test server with a spy on bindCLIShortcuts
		const mockBindCLIShortcuts = vi.spyOn(viteServer, "bindCLIShortcuts");
		// Create mock plugin context
		const mockContext = new PluginContext({
			hasShownWorkerConfigWarnings: false,
			isRestartingDevServer: false,
		});

		mockContext.setResolvedPluginConfig(
			resolvePluginConfig(
				{
					configPath: path.resolve(__dirname, "../wrangler.jsonc"),
					auxiliaryWorkers: [
						{
							configPath: path.resolve(
								__dirname,
								"../wrangler.auxiliary.jsonc"
							),
						},
					],
				},
				{},
				{
					command: "serve",
					mode: "development",
				}
			)
		);

		addBindingsShortcut(viteServer, mockContext);
		// Confirm that addBindingsShortcut wrapped the original method
		expect(viteServer.bindCLIShortcuts).not.toBe(mockBindCLIShortcuts);
		expect(mockBindCLIShortcuts).toHaveBeenCalledExactlyOnceWith({
			customShortcuts: [
				{
					key: "b",
					description: "list configured Cloudflare bindings",
					action: expect.any(Function),
				},
			],
		});

		const { customShortcuts } = mockBindCLIShortcuts.mock.calls[0]?.[0] ?? {};
		const printBindingShortcut = customShortcuts?.find((s) => s.key === "b");

		resetServerLogs();
		// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-floating-promises
		printBindingShortcut?.action?.(viteServer as any);

		expect(normalize(serverLogs.info)).toMatchInlineSnapshot(`
			"
			primary-worker has access to the following bindings:
			Binding                                    Resource
			env.KV (test-kv-id)                        KV Namespace
			env.HYPERDRIVE (test-hyperdrive-id)        Hyperdrive Config
			env.HELLO_WORLD (Timer disabled)           Hello World
			env.WAE (test)                             Analytics Engine Dataset
			env.IMAGES                                 Images
			env.RATE_LIMITER (ratelimit)               Unsafe Metadata

			auxiliary-worker has access to the following bindings:
			Binding                           Resource
			env.SERVICE (primary-worker)      Worker
			"
		`);
	});
});
