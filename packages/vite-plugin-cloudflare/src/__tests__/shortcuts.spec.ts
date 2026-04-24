import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { stripVTControlCharacters } from "node:util";
import { removeDirSync } from "@cloudflare/workers-utils";
import { afterAll, beforeAll, beforeEach, describe, test, vi } from "vitest";
import { PluginContext } from "../context";
import { resolvePluginConfig } from "../plugin-config";
import { addBindingsShortcut, addExplorerShortcut } from "../plugins/shortcuts";
import { satisfiesMinimumViteVersion } from "../utils";
import type * as vite from "vite";

const mockOpen = vi.hoisted(() => vi.fn(() => ({ on: vi.fn() })));
vi.mock("open", () => ({ default: mockOpen }));

/**
 * Creates a mock ViteDevServer with the minimum interface needed for shortcuts tests
 */
function createMockViteServer(serverLogs: { info: string[] }) {
	const mockLogger: vite.Logger = {
		info: (msg: string) => serverLogs.info.push(msg),
		warn: vi.fn(),
		warnOnce: vi.fn(),
		error: vi.fn(),
		clearScreen: vi.fn(),
		hasErrorLogged: () => false,
		hasWarned: false,
	};

	const mockServer = {
		config: {
			logger: mockLogger,
		},
		httpServer: {},
		resolvedUrls: {
			local: ["http://localhost:5173/"],
			network: [],
		},
		bindCLIShortcuts: vi.fn(),
	} as unknown as vite.ViteDevServer;

	return mockServer;
}

const normalize = (logs: string[]) =>
	stripVTControlCharacters(logs.join("\n"))
		.split("\n")
		.map((line) => line.trim())
		.join("\n");

describe.skipIf(!satisfiesMinimumViteVersion("7.2.7"))("shortcuts", () => {
	let tempDir: string;
	let primaryConfigPath: string;
	let auxiliaryConfigPath: string;
	let serverLogs: { info: string[] };
	let mockServer: vite.ViteDevServer;

	beforeAll(() => {
		vi.stubEnv("CI", undefined);
		process.stdin.isTTY = true;
	});

	afterAll(() => {
		vi.unstubAllEnvs();
		process.stdin.isTTY = false;
	});

	beforeEach(() => {
		// Create temp directory for test fixtures
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vite-shortcuts-test-"));

		// Create primary worker config
		primaryConfigPath = path.join(tempDir, "wrangler.jsonc");
		fs.writeFileSync(
			primaryConfigPath,
			JSON.stringify({
				name: "primary-worker",
				main: "./src/index.ts",
				compatibility_date: "2024-12-30",
				kv_namespaces: [{ binding: "KV", id: "test-kv-id" }],
				images: { binding: "IMAGES" },
				unsafe_hello_world: [{ binding: "HELLO_WORLD" }],
				analytics_engine_datasets: [{ dataset: "test", binding: "WAE" }],
				hyperdrive: [{ binding: "HYPERDRIVE", id: "test-hyperdrive-id" }],
				unsafe: {
					bindings: [
						{
							name: "RATE_LIMITER",
							type: "ratelimit",
							namespace_id: "1001",
							simple: { limit: 1, period: 60 },
						},
					],
				},
			})
		);
		// Create the main file so validation passes
		fs.mkdirSync(path.join(tempDir, "src"), { recursive: true });
		fs.writeFileSync(path.join(tempDir, "src/index.ts"), "export default {}");

		// Create auxiliary worker config
		auxiliaryConfigPath = path.join(tempDir, "wrangler.auxiliary.jsonc");
		fs.writeFileSync(
			auxiliaryConfigPath,
			JSON.stringify({
				name: "auxiliary-worker",
				main: "./aux/index.ts",
				compatibility_date: "2024-12-30",
				services: [{ binding: "SERVICE", service: "primary-worker" }],
			})
		);
		fs.mkdirSync(path.join(tempDir, "aux"), { recursive: true });
		fs.writeFileSync(path.join(tempDir, "aux/index.ts"), "export default {}");

		// Reset server logs and create fresh mock server for each test
		serverLogs = { info: [] };
		mockServer = createMockViteServer(serverLogs);

		return () => removeDirSync(tempDir);
	});

	test("display binding shortcut hint", ({ expect }) => {
		const mockContext = new PluginContext({
			hasShownWorkerConfigWarnings: false,
			restartingDevServerCount: 0,
		});
		mockContext.setResolvedPluginConfig(
			resolvePluginConfig(
				{ configPath: primaryConfigPath },
				{},
				{ command: "serve", mode: "development" }
			)
		);
		addBindingsShortcut(mockServer, mockContext);

		serverLogs.info = [];
		mockServer.bindCLIShortcuts();

		expect(normalize(serverLogs.info)).not.toMatch(
			"press b + enter to list configured Cloudflare bindings"
		);

		mockServer.bindCLIShortcuts({ print: true });

		expect(normalize(serverLogs.info)).toMatch(
			"press b + enter to list configured Cloudflare bindings"
		);
	});

	test("prints bindings with a single Worker", ({ expect }) => {
		const mockBindCLIShortcuts = vi.spyOn(mockServer, "bindCLIShortcuts");
		const mockContext = new PluginContext({
			hasShownWorkerConfigWarnings: false,
			restartingDevServerCount: 0,
		});

		mockContext.setResolvedPluginConfig(
			resolvePluginConfig(
				{ configPath: primaryConfigPath },
				{},
				{ command: "serve", mode: "development" }
			)
		);

		addBindingsShortcut(mockServer, mockContext);
		expect(mockServer.bindCLIShortcuts).not.toBe(mockBindCLIShortcuts);
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

		serverLogs.info = [];
		// eslint-disable-next-line @typescript-eslint/no-floating-promises -- test invocation
		printBindingShortcut?.action?.(mockServer);

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

	test("prints bindings with multi Workers", ({ expect }) => {
		const mockBindCLIShortcuts = vi.spyOn(mockServer, "bindCLIShortcuts");
		const mockContext = new PluginContext({
			hasShownWorkerConfigWarnings: false,
			restartingDevServerCount: 0,
		});

		mockContext.setResolvedPluginConfig(
			resolvePluginConfig(
				{
					configPath: primaryConfigPath,
					auxiliaryWorkers: [{ configPath: auxiliaryConfigPath }],
				},
				{},
				{ command: "serve", mode: "development" }
			)
		);

		addBindingsShortcut(mockServer, mockContext);
		expect(mockServer.bindCLIShortcuts).not.toBe(mockBindCLIShortcuts);
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

		serverLogs.info = [];
		// eslint-disable-next-line @typescript-eslint/no-floating-promises -- test invocation
		printBindingShortcut?.action?.(mockServer);

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

	test("registers explorer shortcut with correct URL", async ({ expect }) => {
		const mockBindCLIShortcuts = vi.spyOn(mockServer, "bindCLIShortcuts");

		addExplorerShortcut(mockServer);

		expect(mockBindCLIShortcuts).toHaveBeenCalledWith({
			customShortcuts: [
				{
					key: "e",
					description: "open local explorer",
					action: expect.any(Function),
				},
			],
		});

		const { customShortcuts } = mockBindCLIShortcuts.mock.calls[0]?.[0] ?? {};
		const explorerShortcut = customShortcuts?.find((s) => s.key === "e");

		await explorerShortcut?.action?.(mockServer);

		expect(mockOpen).toHaveBeenCalledWith(
			expect.stringMatching(/^http:\/\/localhost:\d+\/cdn-cgi\/explorer$/)
		);
	});
});
