import { describe, test } from "vitest";
import { validateWorkerEnvironmentOptions } from "../vite-config";
import type {
	AssetsOnlyResolvedConfig,
	WorkersResolvedConfig,
} from "../plugin-config";
import type { ResolvedConfig } from "vite";

describe("validateWorkerEnvironmentOptions", () => {
	test("doesn't throw if there are no config violations", ({ expect }) => {
		const resolvedPluginConfig = {
			environmentNameToWorkerMap: new Map([["worker", { config: {} }]]),
		} as unknown as AssetsOnlyResolvedConfig | WorkersResolvedConfig;
		const resolvedViteConfig = {
			environments: { worker: { resolve: { external: [] } } },
		} as unknown as ResolvedConfig;

		expect(() =>
			validateWorkerEnvironmentOptions(resolvedPluginConfig, resolvedViteConfig)
		).not.toThrow();
	});

	test("throws with an appropriate error message if a Worker environment contains disallowed options", ({
		expect,
	}) => {
		const resolvedPluginConfig = {
			environmentNameToWorkerMap: new Map([["worker", { config: {} }]]),
		} as unknown as AssetsOnlyResolvedConfig | WorkersResolvedConfig;
		const resolvedViteConfig = {
			environments: { worker: { resolve: { external: true } } },
		} as unknown as ResolvedConfig;

		expect(() =>
			validateWorkerEnvironmentOptions(resolvedPluginConfig, resolvedViteConfig)
		).toThrowErrorMatchingInlineSnapshot(
			`
			[Error: The following environment options are incompatible with the Cloudflare Vite plugin:
				- "worker" environment: \`resolve.external\`: true
			To resolve this issue, avoid setting \`resolve.external\` in your Cloudflare Worker environments.
			]
		`
		);
	});

	test("doesn't throw when resolve.external contains only Node.js built-ins (set by Vitest 4)", ({
		expect,
	}) => {
		const resolvedPluginConfig = {
			environmentNameToWorkerMap: new Map([["worker", { config: {} }]]),
		} as unknown as AssetsOnlyResolvedConfig | WorkersResolvedConfig;
		const resolvedViteConfig = {
			environments: {
				worker: {
					resolve: {
						// Vitest 4 sets resolve.external to all Node.js built-ins for
						// non-standard environments via its runnerTransform plugin
						external: ["assert", "buffer", "fs", "node:path", "node:fs"],
					},
				},
			},
		} as unknown as ResolvedConfig;

		expect(() =>
			validateWorkerEnvironmentOptions(resolvedPluginConfig, resolvedViteConfig)
		).not.toThrow();
	});

	test("throws with an appropriate error message if multiple worker environments contain config violations", ({
		expect,
	}) => {
		const resolvedPluginConfig = {
			environmentNameToWorkerMap: new Map([
				["workerA", { config: {} }],
				["workerB", { config: {} }],
				["workerC", { config: {} }],
			]),
		} as unknown as AssetsOnlyResolvedConfig | WorkersResolvedConfig;
		const resolvedViteConfig = {
			environments: {
				workerA: {
					resolve: {
						external: true,
					},
				},
				workerB: {
					resolve: {
						external: ["external-pkg"],
					},
				},
				workerC: { resolve: { external: [] } },
			},
		} as unknown as ResolvedConfig;

		expect(() =>
			validateWorkerEnvironmentOptions(resolvedPluginConfig, resolvedViteConfig)
		).toThrowErrorMatchingInlineSnapshot(
			`
			[Error: The following environment options are incompatible with the Cloudflare Vite plugin:
				- "workerA" environment: \`resolve.external\`: true
				- "workerB" environment: \`resolve.external\`: ["external-pkg"]
			To resolve this issue, avoid setting \`resolve.external\` in your Cloudflare Worker environments.
			]
		`
		);
	});
});
