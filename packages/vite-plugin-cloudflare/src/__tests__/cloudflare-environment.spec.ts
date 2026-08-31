import { describe, test } from "vitest";
import { createCloudflareEnvironmentOptions } from "../cloudflare-environment";
import type { ResolvedWorkerConfig } from "../plugin-config";
import type * as vite from "vite";

function createOptions(hasNodeJsCompat: boolean): vite.EnvironmentOptions {
	return createCloudflareEnvironmentOptions({
		workerConfig: { main: "src/index.ts" } as ResolvedWorkerConfig,
		userConfig: {},
		mode: "development",
		environmentName: "worker",
		isEntryWorker: true,
		isParentEnvironment: true,
		hasNodeJsCompat,
	});
}

function getOptimizerConditions(
	options: vite.EnvironmentOptions
): string[] | undefined {
	const optimizeDeps = options.optimizeDeps as
		| {
				rolldownOptions?: {
					resolve?: { conditionNames?: string[] };
				};
				esbuildOptions?: { conditions?: string[] };
		  }
		| undefined;

	return (
		optimizeDeps?.rolldownOptions?.resolve?.conditionNames ??
		optimizeDeps?.esbuildOptions?.conditions
	);
}

describe.each([
	{
		name: "without Node.js compatibility",
		hasNodeJsCompat: false,
		baseConditions: ["workerd", "worker", "module", "browser"],
	},
	{
		name: "with Node.js compatibility",
		hasNodeJsCompat: true,
		baseConditions: ["workerd", "worker", "module", "node"],
	},
])(
	"Cloudflare environment conditions $name",
	({ hasNodeJsCompat, baseConditions }) => {
		test("uses consistent resolver and optimizer conditions", ({ expect }) => {
			const options = createOptions(hasNodeJsCompat);

			expect(options.resolve?.conditions).toEqual([
				...baseConditions,
				"development|production",
			]);
			expect(getOptimizerConditions(options)).toEqual([
				...baseConditions,
				"development",
			]);
		});
	}
);
