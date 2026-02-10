import { describe, test } from "vitest";
import { validateWorkerEnvironmentOptions } from "../vite-config";

describe("validateWorkerEnvironmentOptions", () => {
	test("doesn't throw if there are no config violations", ({ expect }) => {
		const resolvedPluginConfig = {
			environmentNameToWorkerMap: new Map([["worker", { config: {} }]]),
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} as any;
		const resolvedViteConfig = {
			environments: { worker: { resolve: { external: [] } } },
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} as any;

		expect(() =>
			validateWorkerEnvironmentOptions(resolvedPluginConfig, resolvedViteConfig)
		).not.toThrow();
	});

	test("throws with an appropriate error message if a Worker environment contains disallowed options", ({
		expect,
	}) => {
		const resolvedPluginConfig = {
			environmentNameToWorkerMap: new Map([["worker", { config: {} }]]),
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} as any;
		const resolvedViteConfig = {
			environments: { worker: { resolve: { external: true } } },
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
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

	test("throws with an appropriate error message if multiple worker environments contain config violations", ({
		expect,
	}) => {
		const resolvedPluginConfig = {
			environmentNameToWorkerMap: new Map([
				["workerA", { config: {} }],
				["workerB", { config: {} }],
				["workerC", { config: {} }],
			]),
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
