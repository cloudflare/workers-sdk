import { Framework } from "./framework-class";
import type {
	ConfigurationOptions,
	ConfigurationResults,
} from "./framework-class";

export class Static extends Framework {
	configure({ outputDir, target }: ConfigurationOptions): ConfigurationResults {
		return {
			// cf writes the assets of a static site itself, without Wrangler
			buildTool: target === "cf" ? undefined : "wrangler",
			workerConfig: {},
			buildConfig: { assetsDirectory: outputDir },
		};
	}
}
