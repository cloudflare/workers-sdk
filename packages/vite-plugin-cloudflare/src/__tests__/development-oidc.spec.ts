import { InputWorkerSchema } from "@cloudflare/config";
import { resolveConfig } from "vite";
import { test } from "vitest";
import { getPreviewMiniflareOptions } from "../miniflare-options";
import type { PreviewPluginContext } from "../context";
import type { PreviewResolvedConfig } from "../plugin-config";
import type * as vite from "vite";

test("local Vite preview links each Worker's broker with remote bindings disabled", async ({
	expect,
}) => {
	const configs = ["first-worker", "second-worker"].map((name) =>
		InputWorkerSchema.parse({
			name,
			compatibilityDate: "2026-01-01",
			compatibilityFlags: ["workers_oidc"],
			env: { IDENTITY: { type: "identity", audience: "recipient" } },
		})
	);
	const resolvedViteConfig = await resolveConfig(
		{ logLevel: "silent", configFile: false },
		"serve"
	);
	const resolvedPluginConfig: PreviewResolvedConfig = {
		type: "preview",
		cliDisplayName: "cf",
		workers: configs.map((config) => ({
			config,
			assetsDir: undefined,
			bundle: undefined,
		})),
		persistState: false,
		inspectorPort: false,
		types: { generate: false, includeRuntime: false },
		experimental: {},
		remoteBindings: false,
		tunnel: { autoStart: false },
		containers: [],
		localEnv: { values: {}, sources: {} },
		devVars: undefined,
		settings: { accountId: "a".repeat(32) },
	};
	const ctx = {
		resolvedPluginConfig,
		resolvedViteConfig,
		allWorkerConfigs: configs,
	} as PreviewPluginContext;
	const { miniflareOptions } = await getPreviewMiniflareOptions(ctx, {
		config: resolvedViteConfig,
	} as vite.PreviewServer);
	const brokers = miniflareOptions.workers.map(
		(worker) => worker.dev?.developmentOidc
	);
	expect(brokers).toHaveLength(2);
	expect(brokers[0]?.key).toContain("first-worker");
	expect(brokers[1]?.key).toContain("second-worker");
	expect(brokers[0]?.key).not.toBe(brokers[1]?.key);
	expect(JSON.parse(brokers[0]?.key ?? "null")[5]).toBe(true);
	expect(miniflareOptions.workers[0]?.config.env?.IDENTITY).toEqual({
		type: "identity",
		audience: "recipient",
	});
});
