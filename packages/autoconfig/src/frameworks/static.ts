import { Framework } from "./framework-class";
import type {
	ConfigurationOptions,
	ConfigurationResults,
} from "./framework-class";

export class Static extends Framework {
	configure({
		outputDir,
		existingWorkerConfig,
	}: ConfigurationOptions): ConfigurationResults | null {
		// The project's own Worker config already describes its Worker and assets
		if (existingWorkerConfig) {
			return null;
		}
		return {
			buildTool: "wrangler",
			workerConfig: {},
			buildConfig: { assetsDirectory: outputDir },
		};
	}
}
