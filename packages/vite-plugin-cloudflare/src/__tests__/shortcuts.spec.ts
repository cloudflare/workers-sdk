import * as fs from "node:fs";
import * as path from "node:path";
import { stripVTControlCharacters } from "node:util";
import { removeDirSync } from "@cloudflare/workers-utils";
import { afterAll, beforeAll, beforeEach, describe, test, vi } from "vitest";
import { PluginContext } from "../context";
import { resolvePluginConfig } from "../plugin-config";
import { addShortcuts } from "../plugins/shortcuts";
import * as tunnelPlugin from "../plugins/tunnel";
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

const FIXTURES_ROOT = path.resolve(__dirname, "fixtures", "shortcuts");

describe.skipIf(!satisfiesMinimumViteVersion("7.2.7"))("shortcuts", () => {
	let tempDir: string;
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
		fs.mkdirSync(FIXTURES_ROOT, { recursive: true });
		tempDir = fs.realpathSync(
			fs.mkdtempSync(path.join(FIXTURES_ROOT, "case-"))
		);

		// Create primary worker config
		fs.writeFileSync(
			path.join(tempDir, "cloudflare.config.ts"),
			[
				"import { defineWorker } from '@cloudflare/config';",
				"export default defineWorker({",
				"  name: 'primary-worker',",
				"  entrypoint: './src/index.ts',",
				"  compatibilityDate: '2024-12-30',",
				"  env: {",
				"    KV: { type: 'kv', id: 'test-kv-id' },",
				"    IMAGES: { type: 'images' },",
				"    WAE: { type: 'analytics-engine-dataset', name: 'test' },",
				"    HYPERDRIVE: { type: 'hyperdrive', id: 'test-hyperdrive-id', dev: { connectionString: 'postgres://localhost/test' } },",
				"    RATE_LIMITER: { type: 'rate-limit', namespace: '1001', simple: { limit: 1, period: 60 } },",
				"  },",
				"});",
			].join("\n")
		);
		// Create the main file so validation passes
		fs.mkdirSync(path.join(tempDir, "src"), { recursive: true });
		fs.writeFileSync(path.join(tempDir, "src/index.ts"), "export default {}");

		// Create auxiliary worker source
		fs.mkdirSync(path.join(tempDir, "aux"), { recursive: true });
		fs.writeFileSync(path.join(tempDir, "aux/index.ts"), "export default {}");

		// Reset server logs and create fresh mock server for each test
		serverLogs = { info: [] };
		mockServer = createMockViteServer(serverLogs);

		return () => removeDirSync(tempDir);
	});

	async function createMockContext(options?: { auxiliaryWorker?: boolean }) {
		const mockContext = new PluginContext({
			restartingDevServerCount: 0,
			tunnelHostnames: new Set(),
		});
		if (options?.auxiliaryWorker) {
			fs.appendFileSync(
				path.join(tempDir, "cloudflare.config.ts"),
				[
					"export const auxiliaryWorker = defineWorker({",
					"  name: 'auxiliary-worker',",
					"  entrypoint: './aux/index.ts',",
					"  compatibilityDate: '2024-12-30',",
					"  env: {",
					"    SERVICE: { type: 'worker', worker: 'primary-worker' },",
					"  },",
					"});",
				].join("\n")
			);
		}

		mockContext.setResolvedPluginConfig(
			await resolvePluginConfig(
				{
					types: { generate: false },
				},
				{ root: tempDir },
				{ command: "serve", mode: "development" }
			)
		);

		return mockContext;
	}

	test("prints shortcut hints in registration order", async ({ expect }) => {
		vi.spyOn(tunnelPlugin, "isTunnelOpen").mockReturnValue(false);
		addShortcuts(mockServer, await createMockContext());

		serverLogs.info = [];
		mockServer.bindCLIShortcuts();

		expect(normalize(serverLogs.info)).toBe("");

		mockServer.bindCLIShortcuts({ print: true });

		expect(normalize(serverLogs.info)).toBe(
			[
				"➜  press b + enter to list configured Cloudflare bindings",
				"➜  press e + enter to open local explorer",
				"➜  press t + enter to start tunnel",
			].join("\n")
		);
	});

	test("registers custom shortcuts in order", async ({ expect }) => {
		const mockBindCLIShortcuts = vi.spyOn(mockServer, "bindCLIShortcuts");

		addShortcuts(mockServer, await createMockContext());

		expect(mockServer.bindCLIShortcuts).not.toBe(mockBindCLIShortcuts);
		expect(mockBindCLIShortcuts).toHaveBeenCalledWith({
			customShortcuts: [
				{
					key: "b",
					description: "list configured Cloudflare bindings",
					action: expect.any(Function),
				},
				{
					key: "e",
					description: "open local explorer",
					action: expect.any(Function),
				},
				{
					key: "t",
					description: "start or close tunnel",
					action: expect.any(Function),
				},
				{
					key: "a",
					description: "extend tunnel by 1 hour",
					action: expect.any(Function),
				},
			],
		});
	});

	test("prints bindings with a single Worker", async ({ expect }) => {
		const mockBindCLIShortcuts = vi.spyOn(mockServer, "bindCLIShortcuts");
		addShortcuts(mockServer, await createMockContext());

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
			env.WAE (test)                             Analytics Engine Dataset
			env.IMAGES                                 Images
			env.RATE_LIMITER (1 requests/60s)          Rate Limit
			"
		`);
	});

	test("prints bindings with multi Workers", async ({ expect }) => {
		const mockBindCLIShortcuts = vi.spyOn(mockServer, "bindCLIShortcuts");
		addShortcuts(
			mockServer,
			await createMockContext({
				auxiliaryWorker: true,
			})
		);

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
			env.WAE (test)                             Analytics Engine Dataset
			env.IMAGES                                 Images
			env.RATE_LIMITER (1 requests/60s)          Rate Limit

			auxiliary-worker has access to the following bindings:
			Binding                           Resource
			env.SERVICE (primary-worker)      Worker
			"
		`);
	});

	test("registers explorer shortcut with correct URL", async ({ expect }) => {
		const mockBindCLIShortcuts = vi.spyOn(mockServer, "bindCLIShortcuts");
		addShortcuts(mockServer, await createMockContext());

		const { customShortcuts } = mockBindCLIShortcuts.mock.calls[0]?.[0] ?? {};
		const explorerShortcut = customShortcuts?.find((s) => s.key === "e");

		await explorerShortcut?.action?.(mockServer);

		expect(mockOpen).toHaveBeenCalledWith(
			expect.stringMatching(
				/^http:\/\/localhost:\d+\/cdn-cgi\/local\/explorer$/
			)
		);
	});

	test("registers tunnel shortcut and extends expiry", async ({ expect }) => {
		const toggleTunnelSpy = vi
			.spyOn(tunnelPlugin, "toggleTunnel")
			.mockResolvedValue(undefined);
		const extendExpirySpy = vi
			.spyOn(tunnelPlugin, "extendTunnelExpiry")
			.mockImplementation(() => {});
		const mockBindCLIShortcuts = vi.spyOn(mockServer, "bindCLIShortcuts");
		addShortcuts(mockServer, await createMockContext());

		const { customShortcuts } = mockBindCLIShortcuts.mock.calls[0]?.[0] ?? {};
		const toggleShortcut = customShortcuts?.find((s) => s.key === "t");
		const extendShortcut = customShortcuts?.find((s) => s.key === "a");

		await toggleShortcut?.action?.(mockServer);
		void extendShortcut?.action?.(mockServer);

		expect(toggleTunnelSpy).toHaveBeenCalledTimes(1);
		expect(extendExpirySpy).toHaveBeenCalledTimes(1);
	});

	test("display tunnel shortcut hint", async ({ expect }) => {
		vi.spyOn(tunnelPlugin, "isTunnelOpen")
			.mockReturnValueOnce(false)
			.mockReturnValueOnce(true);

		addShortcuts(mockServer, await createMockContext());

		serverLogs.info = [];
		mockServer.bindCLIShortcuts();

		expect(normalize(serverLogs.info)).not.toMatch(
			"press t + enter to start tunnel"
		);

		mockServer.bindCLIShortcuts({ print: true });

		expect(normalize(serverLogs.info)).toMatch(
			"press t + enter to start tunnel"
		);

		serverLogs.info = [];
		mockServer.bindCLIShortcuts({ print: true });

		expect(normalize(serverLogs.info)).toMatch(
			"press t + enter to close tunnel"
		);
	});
});
