import assert from "node:assert";
import { Framework } from "./framework-class";
import type {
	ConfigurationOptions,
	ConfigurationResults,
} from "./framework-class";

export class Static extends Framework {
	configure({
		outputDir,
		existingWorkerConfig,
	}: ConfigurationOptions): ConfigurationResults {
		// The project's own Worker config already describes its Worker and assets
		if (existingWorkerConfig) {
			return { workerConfig: {}, skipped: true };
		}
		assert(outputDir, "The Output Directory is unexpectedly missing");
		return {
			buildTool: "wrangler",
			workerConfig: {},
			buildConfig: { assetsDirectory: outputDir },
		};
	}
}
