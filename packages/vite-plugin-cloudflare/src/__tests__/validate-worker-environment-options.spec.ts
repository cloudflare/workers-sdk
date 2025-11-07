import { describe, expect, test } from "vitest";

import { validateWorkerEnvironmentOptions } from "../vite-config";

describe("validateWorkerEnvironmentOptions", () => {
	test("doesn't throw if there are no config violations", () => {
		const resolvedPluginConfig = { workers: { worker: {} } } as any;
		const resolvedViteConfig = {
			environments: { worker: { resolve: { external: [] } } },
		} as any;

		expect(() =>
			validateWorkerEnvironmentOptions(resolvedPluginConfig, resolvedViteConfig)
		).not.toThrow();
	});

	test("throws with an appropriate error message if a Worker environment contains disallowed options", () => {
		const resolvedPluginConfig = { workers: { worker: {} } } as any;
		const resolvedViteConfig = {
			environments: { worker: { resolve: { external: true } } },
		} as any;

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

	test("throws with an appropriate error message if multiple worker environments contain config violations", () => {
		const resolvedPluginConfig = {
			workers: {
				workerA: {},
				workerB: {},
				workerC: {},
			},
		} as any;
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
		} as any;

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
