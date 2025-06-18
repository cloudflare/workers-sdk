import { describe, expect, test } from "vitest";
import { validateWorkerEnvironmentsResolvedConfigs } from "../worker-environments-validation";
import type { WorkersResolvedConfig } from "../plugin-config";
import type * as vite from "vite";

function getWorkerPluginConfig(
	workersEnvs: Record<string, { nodejsCompat?: boolean }>
) {
	const workers: Record<string, {}> = {};

	for (const [workerEnvName, nodejsCompatEnabled] of Object.entries(
		workersEnvs
	)) {
		workers[workerEnvName] = {
			...(nodejsCompatEnabled.nodejsCompat
				? {
						compatibility_date: "2024-09-23",
						compatibility_flags: ["nodejs_compat"],
					}
				: []),
		};
	}

	return {
		workers,
	} as WorkersResolvedConfig;
}

type WorkerViteConfig = {
	optimizeDeps?: { exclude: vite.DepOptimizationOptions["exclude"] };
	resolve?: { external: vite.ResolveOptions["external"] };
};

function getResolvedViteConfig(
	workerConfigs: Record<string, WorkerViteConfig>
) {
	const environments: Record<string, Required<WorkerViteConfig>> = {};

	for (const [workerEnvName, config] of Object.entries(workerConfigs)) {
		environments[workerEnvName] = {
			optimizeDeps: { exclude: config.optimizeDeps?.exclude ?? [] },
			resolve: { external: config.resolve?.external ?? [] },
		};
	}

	return {
		environments,
	} as vite.ResolvedConfig;
}

describe("validateWorkerEnvironmentsResolvedConfigs", () => {
	test("doesn't throw if there are no config violations", () => {
		const workerPluginConfig = getWorkerPluginConfig({ worker: {} });

		const resolvedViteConfig = getResolvedViteConfig({
			worker: {
				optimizeDeps: {
					exclude: [],
				},
				resolve: {
					external: [],
				},
			},
		});

		expect(() =>
			validateWorkerEnvironmentsResolvedConfigs(
				workerPluginConfig,
				resolvedViteConfig
			)
		).not.toThrow();
	});

	test("doesn't throw if optimizeDeps exclude includes cloudflare modules", () => {
		const workerPluginConfig = getWorkerPluginConfig({ worker: {} });

		const resolvedViteConfig = getResolvedViteConfig({
			worker: {
				optimizeDeps: {
					exclude: ["cloudflare:workers", "cloudflare:workflows"],
				},
			},
		});

		expect(() =>
			validateWorkerEnvironmentsResolvedConfigs(
				workerPluginConfig,
				resolvedViteConfig
			)
		).not.toThrow();
	});

	test("throws if optimizeDeps exclude includes node builtin modules and nodejs compat is not enabled", () => {
		const workerPluginConfig = getWorkerPluginConfig({ worker: {} });

		const resolvedViteConfig = getResolvedViteConfig({
			worker: {
				optimizeDeps: {
					exclude: ["node:assert"],
				},
			},
		});

		expect(() =>
			validateWorkerEnvironmentsResolvedConfigs(
				workerPluginConfig,
				resolvedViteConfig
			)
		).toThrowErrorMatchingInlineSnapshot(`
			[Error: The following environment configurations are incompatible with the Cloudflare Vite plugin:
				- "worker" environment: \`optimizeDeps.exclude\`: ["node:assert"]
			To resolve this issue, avoid setting \`optimizeDeps.exclude\` and \`resolve.external\` in your Cloudflare Worker environments.
			]
		`);
	});

	test("doesn't throw if optimizeDeps exclude includes node builtin modules and nodejs compat is enabled", () => {
		const workerPluginConfig = getWorkerPluginConfig({
			worker: { nodejsCompat: true },
		});

		const resolvedViteConfig = getResolvedViteConfig({
			worker: {
				optimizeDeps: {
					exclude: ["node:assert"],
				},
			},
		});

		expect(() =>
			validateWorkerEnvironmentsResolvedConfigs(
				workerPluginConfig,
				resolvedViteConfig
			)
		).not.toThrow();
	});

	test("throws with an appropriate error message if a worker environment contains config violations", () => {
		const resolvedPluginConfig = getWorkerPluginConfig({ worker: {} });

		const resolvedViteConfig = getResolvedViteConfig({
			worker: {
				optimizeDeps: {
					exclude: ["pkgA", "pkgB"],
				},
				resolve: {
					external: true,
				},
			},
		});

		expect(() =>
			validateWorkerEnvironmentsResolvedConfigs(
				resolvedPluginConfig,
				resolvedViteConfig
			)
		).toThrowErrorMatchingInlineSnapshot(
			`
			[Error: The following environment configurations are incompatible with the Cloudflare Vite plugin:
				- "worker" environment: \`optimizeDeps.exclude\`: ["pkgA","pkgB"]
				- "worker" environment: \`resolve.external\`: true
			To resolve this issue, avoid setting \`optimizeDeps.exclude\` and \`resolve.external\` in your Cloudflare Worker environments.
			]
		`
		);
	});

	test("throws with an appropriate error message if multiple worker environments contain config violations", () => {
		const resolvedPluginConfig = getWorkerPluginConfig({
			workerA: {},
			workerB: {},
			workerC: {},
		});

		const resolvedViteConfig = getResolvedViteConfig({
			workerA: {
				optimizeDeps: {
					exclude: ["pkgA"],
				},
				resolve: {
					external: true,
				},
			},
			workerB: {
				resolve: {
					external: ["externalPkg1"],
				},
			},
			workerC: {
				optimizeDeps: {
					exclude: ["pkgB"],
				},
			},
		});

		expect(() =>
			validateWorkerEnvironmentsResolvedConfigs(
				resolvedPluginConfig,
				resolvedViteConfig
			)
		).toThrowErrorMatchingInlineSnapshot(
			`
			[Error: The following environment configurations are incompatible with the Cloudflare Vite plugin:
				- "workerA" environment: \`optimizeDeps.exclude\`: ["pkgA"]
				- "workerA" environment: \`resolve.external\`: true
				- "workerB" environment: \`resolve.external\`: ["externalPkg1"]
				- "workerC" environment: \`optimizeDeps.exclude\`: ["pkgB"]
			To resolve this issue, avoid setting \`optimizeDeps.exclude\` and \`resolve.external\` in your Cloudflare Worker environments.
			]
		`
		);
	});
});
