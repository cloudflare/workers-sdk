import { unstable_readConfig as readConfig } from "wrangler/config";

export function analyzeConfig(configPath) {
	const config = readConfig({
		config: configPath,
	});

	return {
		nameOfWorker: config.name,
		numberOfVars: Object.keys(config.vars).length,
	};
}
