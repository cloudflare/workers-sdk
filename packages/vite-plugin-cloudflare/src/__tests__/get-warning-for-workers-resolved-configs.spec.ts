import { describe, test } from "vitest";
import { getWarningForWorkersConfigs } from "../workers-configs";
import type { ResolvedWorkerConfig } from "../plugin-config";
import type { Unstable_Config as RawWorkerConfig } from "wrangler";

describe("getWarningForWorkersConfigs", () => {
	describe("no warning needed", () => {
		test("entry worker only", ({ expect }) => {
			const warning = getWarningForWorkersConfigs({
				entryWorker: {
					type: "worker",
					config: {
						name: "entry-worker",
						configPath: "./wrangler.json",
					} as Partial<ResolvedWorkerConfig> as ResolvedWorkerConfig,
					nonApplicable: getEmptyNotApplicableMap(),
					raw: getEmptyRawConfig(),
				},
				auxiliaryWorkers: [],
			});
			expect(warning).toBeUndefined();
		});

		test("multi workers", ({ expect }) => {
			const warning = getWarningForWorkersConfigs({
				entryWorker: {
					type: "worker",
					config: {
						name: "entry-worker",
						configPath: "./wrangler.json",
					} as Partial<ResolvedWorkerConfig> as ResolvedWorkerConfig,
					nonApplicable: getEmptyNotApplicableMap(),
					raw: getEmptyRawConfig(),
				},
				auxiliaryWorkers: [
					{
						type: "worker",
						config: {
							name: "worker-a",
							configPath: "./a/wrangler.json",
						} as Partial<ResolvedWorkerConfig> as ResolvedWorkerConfig,
						nonApplicable: getEmptyNotApplicableMap(),
						raw: getEmptyRawConfig(),
					},
					{
						type: "worker",
						config: {
							configPath: "./b/wrangler.json",
						} as Partial<ResolvedWorkerConfig> as ResolvedWorkerConfig,
						nonApplicable: getEmptyNotApplicableMap(),
						raw: getEmptyRawConfig(),
					},
				],
			});
			expect(warning).toBeUndefined();
		});
	});

	test("entry worker only", ({ expect }) => {
		const warning = getWarningForWorkersConfigs({
			entryWorker: {
				type: "worker",
				config: {
					name: "entry-worker",
					configPath: "./wrangler.json",
				} as Partial<ResolvedWorkerConfig> as ResolvedWorkerConfig,
				nonApplicable: {
					replacedByVite: new Set(["alias", "minify"]),
					notRelevant: new Set([
						"build",
						"find_additional_modules",
						"no_bundle",
						"rules",
					]),
				},
				raw: getEmptyRawConfig(),
			},

			auxiliaryWorkers: [],
		});
		expect(warning).toMatchInlineSnapshot(`
			"

			[43mWARNING[0m: your worker config (at \`wrangler.json\`) contains the following configuration options which are ignored since they are not applicable when using Vite:
			  - \`alias\` which is replaced by Vite's \`resolve.alias\` (docs: https://vite.dev/config/shared-options.html#resolve-alias)
			  - \`minify\` which is replaced by Vite's \`build.minify\` (docs: https://vite.dev/config/build-options.html#build-minify)
			  - \`build\`, \`find_additional_modules\`, \`no_bundle\`, \`rules\` which are not relevant in the context of a Vite project
			"
		`);
	});

	test("multi workers", ({ expect }) => {
		const warning = getWarningForWorkersConfigs({
			entryWorker: {
				type: "worker",
				config: {
					name: "entry-worker",
					configPath: "./wrangler.json",
				} as Partial<ResolvedWorkerConfig> as ResolvedWorkerConfig,
				nonApplicable: {
					replacedByVite: new Set(["alias"]),
					notRelevant: new Set(["build"]),
				},
				raw: getEmptyRawConfig(),
			},
			auxiliaryWorkers: [
				{
					type: "worker",
					config: {
						name: "worker-a",
						configPath: "./a/wrangler.json",
					} as Partial<ResolvedWorkerConfig> as ResolvedWorkerConfig,
					nonApplicable: {
						replacedByVite: new Set([]),
						notRelevant: new Set(["find_additional_modules", "no_bundle"]),
					},
					raw: getEmptyRawConfig(),
				},
				{
					type: "worker",
					config: {
						configPath: "./b/wrangler.json",
					} as Partial<ResolvedWorkerConfig> as ResolvedWorkerConfig,
					nonApplicable: {
						replacedByVite: new Set([]),
						notRelevant: new Set(["site"]),
					},
					raw: getEmptyRawConfig(),
				},
			],
		});
		// Note: to make the snapshot work on windows we need to replace path backslashes into normal forward ones
		const normalizedWarning = warning?.replaceAll(
			"\\wrangler.json",
			"/wrangler.json"
		);
		expect(normalizedWarning).toMatchInlineSnapshot(`
				"
				[43mWARNING[0m: your workers configs contain configuration options which are ignored since they are not applicable when using Vite:
				  - (entry) worker "entry-worker" (config at \`wrangler.json\`)
				    - \`alias\` which is replaced by Vite's \`resolve.alias\` (docs: https://vite.dev/config/shared-options.html#resolve-alias)
				    - \`build\` which is not relevant in the context of a Vite project
				  - (auxiliary) worker "worker-a" (config at \`a/wrangler.json\`)
				    - \`find_additional_modules\`, \`no_bundle\` which are not relevant in the context of a Vite project
				  - (auxiliary) worker (config at \`b/wrangler.json\`)
				    - \`site\` which is not relevant in the context of a Vite project
				"
			`);
	});
});

function getEmptyNotApplicableMap() {
	return {
		replacedByVite: new Set([]),
		notRelevant: new Set([]),
	};
}

function getEmptyRawConfig() {
	return {} as RawWorkerConfig;
}
