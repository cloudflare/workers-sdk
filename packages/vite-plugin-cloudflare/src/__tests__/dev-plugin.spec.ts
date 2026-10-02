import { beforeEach, describe, it, vi } from "vitest";
import { PluginContext } from "../context";
import { devPlugin } from "../plugins/dev";
import type { SharedContext } from "../context";
import type { ExportTypes } from "../export-types";
import type {
	ResolvedWorkerConfig,
	WorkersResolvedConfig,
} from "../plugin-config";
import type * as vite from "vite";

const getDevMiniflareOptionsMock = vi.hoisted(() => vi.fn());
const initRunnersMock = vi.hoisted(() => vi.fn());
const getCurrentWorkerNameToExportTypesMapMock = vi.hoisted(() => vi.fn());
const compareWorkerNameToExportTypesMapsMock = vi.hoisted(() => vi.fn());
const compareExportTypesMock = vi.hoisted(() => vi.fn());
const handleWebSocketMock = vi.hoisted(() => vi.fn());

vi.mock("../miniflare-options", () => ({
	getDevMiniflareOptions: getDevMiniflareOptionsMock,
}));

vi.mock("../cloudflare-environment", () => ({
	initRunners: initRunnersMock,
}));

vi.mock("../export-types", () => ({
	compareExportTypes: compareExportTypesMock,
	compareWorkerNameToExportTypesMaps: compareWorkerNameToExportTypesMapsMock,
	getCurrentWorkerNameToExportTypesMap:
		getCurrentWorkerNameToExportTypesMapMock,
}));

vi.mock("../websockets", () => ({
	handleWebSocket: handleWebSocketMock,
}));

const exportTypesMap = new Map<string, ExportTypes>([["worker", {}]]);

function createMockContext(): PluginContext {
	const ctx = new PluginContext({
		hasShownWorkerConfigWarnings: false,
		restartingDevServerCount: 0,
		tunnelHostnames: new Set(),
	} satisfies SharedContext);
	const workerConfig = {
		name: "worker",
	} as ResolvedWorkerConfig;
	const resolvedPluginConfig = {
		type: "workers",
		entryWorkerEnvironmentName: "worker",
		environmentNameToWorkerMap: new Map([
			[
				"worker",
				{
					config: workerConfig,
				},
			],
		]),
		environmentNameToChildEnvironmentNamesMap: new Map(),
	} as unknown as WorkersResolvedConfig;

	Object.defineProperty(ctx, "entryWorkerConfig", { value: workerConfig });
	Object.defineProperty(ctx, "miniflare", { value: {} });
	Object.defineProperty(ctx, "resolvedPluginConfig", {
		value: resolvedPluginConfig,
	});
	Object.defineProperty(ctx, "workerNameToExportTypesMap", {
		value: exportTypesMap,
	});
	vi.spyOn(ctx, "getWorkerConfig").mockReturnValue(workerConfig);
	vi.spyOn(ctx, "setWorkerNameToExportTypesMap").mockReturnValue();
	vi.spyOn(ctx, "startOrUpdateMiniflare").mockResolvedValue();

	return ctx;
}

function createMockViteDevServer(
	httpServer: vite.ViteDevServer["httpServer"]
): vite.ViteDevServer {
	return {
		config: {
			logger: {
				info: vi.fn(),
			},
		},
		environments: {
			worker: {
				hot: {
					on: vi.fn(),
				},
			},
		},
		httpServer,
		middlewares: {
			use: vi.fn(),
		},
	} as unknown as vite.ViteDevServer;
}

function getWorkerHotOn(viteDevServer: vite.ViteDevServer) {
	const environment = viteDevServer.environments.worker;
	if (!environment) {
		throw new Error("Expected worker environment to be defined");
	}

	return environment.hot.on;
}

async function configureServer(
	plugin: vite.Plugin,
	viteDevServer: vite.ViteDevServer
) {
	type ConfigureServerFunction = (
		this: unknown,
		server: vite.ViteDevServer
	) => unknown;

	const hook = plugin.configureServer;
	if (typeof hook === "function") {
		await (hook as ConfigureServerFunction).call({}, viteDevServer);
	} else {
		await (hook?.handler as ConfigureServerFunction | undefined)?.call(
			{},
			viteDevServer
		);
	}
}

describe("devPlugin", () => {
	beforeEach(() => {
		vi.resetAllMocks();
		getDevMiniflareOptionsMock.mockResolvedValue({
			containerTagToOptionsMap: new Map(),
			miniflareOptions: {},
		});
		initRunnersMock.mockResolvedValue(undefined);
		getCurrentWorkerNameToExportTypesMapMock.mockResolvedValue(exportTypesMap);
		compareWorkerNameToExportTypesMapsMock.mockReturnValue(false);
		compareExportTypesMock.mockReturnValue(false);
	});

	it("skips live export inspection in middleware mode", async ({ expect }) => {
		const plugin = devPlugin(createMockContext());
		const viteDevServer = createMockViteDevServer(null);
		const hotOn = getWorkerHotOn(viteDevServer);

		await configureServer(plugin, viteDevServer);

		expect(initRunnersMock).toHaveBeenCalledTimes(1);
		expect(getCurrentWorkerNameToExportTypesMapMock).not.toHaveBeenCalled();
		expect(hotOn).not.toHaveBeenCalled();
	});

	it("runs live export inspection when Vite owns an HTTP server", async ({
		expect,
	}) => {
		const plugin = devPlugin(createMockContext());
		const httpServer = {
			on: vi.fn(),
		} as unknown as vite.ViteDevServer["httpServer"];
		const viteDevServer = createMockViteDevServer(httpServer);
		const hotOn = getWorkerHotOn(viteDevServer);

		await configureServer(plugin, viteDevServer);

		expect(getCurrentWorkerNameToExportTypesMapMock).toHaveBeenCalledTimes(1);
		expect(hotOn).toHaveBeenCalledWith(
			"vite-plugin-cloudflare:worker-export-types",
			expect.any(Function)
		);
	});
});
