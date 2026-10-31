import fs from "node:fs";
import path from "node:path";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { resolveConfig } from "vite";
import { test } from "vitest";
import * as wrangler from "wrangler";
import { getPreviewMiniflareOptions } from "../miniflare-options";
import type { PreviewPluginContext } from "../context";
import type { PreviewResolvedConfig } from "../plugin-config";
import type * as vite from "vite";

runInTempDir();
test("local Vite preview links each Worker's broker with remote bindings disabled", async ({
	expect,
}) => {
	fs.writeFileSync("index.js", "export default {};");
	const configs = ["first-worker", "second-worker"].map((name) => {
		const configPath = path.resolve(`${name}.jsonc`);
		fs.writeFileSync(
			configPath,
			JSON.stringify({
				name,
				main: "./index.js",
				account_id: "a".repeat(32),
				compatibility_date: "2026-01-01",
				compatibility_flags: ["workers_oidc"],
				identities: [{ binding: "IDENTITY", audience: "recipient" }],
			})
		);
		return wrangler.unstable_readConfig({ config: configPath });
	});
	const resolvedViteConfig = await resolveConfig(
		{ logLevel: "silent", root: process.cwd() },
		"serve"
	);
	const resolvedPluginConfig: PreviewResolvedConfig = {
		type: "preview",
		cliDisplayName: "Wrangler",
		workers: configs.map((config) => ({ source: "legacy", config })),
		persistState: false,
		inspectorPort: false,
		experimental: { headersAndRedirectsDevModeSupport: false },
		remoteBindings: false,
		tunnel: { autoStart: false },
	};
	const ctx = {
		resolvedPluginConfig,
		resolvedViteConfig,
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
});
