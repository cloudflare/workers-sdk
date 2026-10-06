import { Framework } from "./framework-class";
import type {
	ConfigurationOptions,
	ConfigurationResults,
} from "./framework-class";

export class Static extends Framework {
	configure({ outputDir }: ConfigurationOptions): ConfigurationResults {
		return {
			buildTool: "wrangler",
			workerConfig: {},
			buildConfig: { assetsDirectory: outputDir },
		};
	}
}
