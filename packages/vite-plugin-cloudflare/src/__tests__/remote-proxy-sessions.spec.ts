import { maybeStartOrUpdateRemoteProxySession } from "@cloudflare/remote-bindings";
import { createLogger } from "vite";
import { test, vi } from "vitest";
import { PluginContext } from "../context";
import {
	getDevMiniflareOptions,
	getPreviewMiniflareOptions,
} from "../miniflare-options";
import type { PreviewPluginContext, WorkersPluginContext } from "../context";
import type { ResolvedPluginConfig } from "../plugin-config";
import type { RemoteProxySessionData } from "@cloudflare/remote-bindings";
import type { RemoteProxyConnectionString } from "miniflare";
import type * as vite from "vite";

vi.mock("@cloudflare/remote-bindings", () => ({
	maybeStartOrUpdateRemoteProxySession: vi.fn(),
}));

// Source imports must read the worker scripts emitted by the package build.
vi.mock("node:fs/promises", async (importOriginal) => {
	const original = await importOriginal<typeof import("node:fs/promises")>();
	const { fileURLToPath } = await import("node:url");
	const sourceWorkers = fileURLToPath(new URL("../workers/", import.meta.url));
	const builtWorkers = fileURLToPath(
		new URL("../../dist/workers/", import.meta.url)
	);
	return {
		...original,
		readFile(file: Parameters<typeof original.readFile>[0], options?: object) {
			if (
				typeof file === "string" &&
				file.startsWith(sourceWorkers) &&
				file.endsWith(".js")
			) {
				file = builtWorkers + file.slice(sourceWorkers.length);
			}
			return original.readFile(file, options);
		},
	};
});

test.for(["dev", "preview"] as const)(
	"preserves shared remote sessions when bindings are disabled in %s",
	async (mode, { expect }) => {
		const sessionData: RemoteProxySessionData = {
			session: {
				ready: Promise.resolve(),
				dispose: vi.fn(async () => {}),
				updateBindings: vi.fn(),
				remoteProxyConnectionString: new URL(
					"http://localhost:8787"
				) as RemoteProxyConnectionString,
			},
			remoteBindings: {},
		};
		const startSession = vi.mocked(maybeStartOrUpdateRemoteProxySession);
		startSession.mockReset().mockResolvedValue(sessionData);
		const worker = {
			config: {
				name: `shared-remote-${mode}`,
				compatibilityDate: "2026-01-01",
				env: { AI: { type: "ai" } },
			},
		};
		const resolvedPluginConfig = {
			type: mode === "dev" ? "workers" : "preview",
			remoteBindings: true,
			inspectorPort: false,
			persistState: false,
			localEnv: { values: {} },
			settings: {},
			containers: [],
			workers: [worker],
			entryWorkerEnvironmentName: "worker",
			environmentNameToWorkerMap: new Map([["worker", worker]]),
		} as unknown as ResolvedPluginConfig;
		const ctx = new PluginContext({
			restartingDevServerCount: 0,
			tunnelHostnames: new Set(),
		});
		ctx.setResolvedPluginConfig(resolvedPluginConfig);
		ctx.setWorkerNameToExportTypesMap(new Map([[worker.config.name, {}]]));
		const config = {
			root: process.cwd(),
			mode: "development",
			logger: createLogger("silent"),
			logLevel: "silent",
			server: { port: 0 },
			preview: { port: 0 },
		} as unknown as vite.ResolvedConfig;
		ctx.setResolvedViteConfig(config);
		async function getOptions() {
			return mode === "dev"
				? getDevMiniflareOptions(
						ctx as WorkersPluginContext,
						{
							config,
						} as vite.ViteDevServer
					)
				: getPreviewMiniflareOptions(
						ctx as PreviewPluginContext,
						{
							config,
						} as vite.PreviewServer
					);
		}

		await getOptions();
		expect(startSession).toHaveBeenCalledOnce();
		resolvedPluginConfig.remoteBindings = false;
		const disabled = await getOptions();
		expect(startSession).toHaveBeenCalledOnce();
		expect(
			disabled.miniflareOptions.workers.find(
				(candidate) => candidate.config.name === worker.config.name
			)?.dev?.remoteProxyConnectionString
		).toBeUndefined();
		expect(sessionData.session.dispose).not.toHaveBeenCalled();

		resolvedPluginConfig.remoteBindings = true;
		await getOptions();
		expect(startSession).toHaveBeenCalledTimes(2);
		expect(startSession.mock.calls[1]?.[1]).toBe(sessionData);
	}
);
