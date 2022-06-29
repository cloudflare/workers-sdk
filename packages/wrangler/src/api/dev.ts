import { startDev } from "../dev";
import { logger } from "../logger";
interface DevOptions {
	env?: string;
	ip?: string;
	port?: number;
	localProtocol?: "http" | "https";
	assets?: string;
	site?: string;
	siteInclude?: string[];
	siteExclude?: string[];
	nodeCompat?: boolean;
	experimentalEnableLocalPersistence?: boolean;
	_: (string | number)[]; //yargs wants this
	$0: string; //yargs wants this
}

export async function unstable_dev(script: string, options: DevOptions) {
	logger.warn(
		`unstable_dev() is experimental\nunstable_dev()'s behaviour will likely change in future releases`
	);
	logger.loggerLevel = "error";
	return new Promise<void>((resolve) => {
		return startDev({
			script: script,
			...options,
			isApi: true,
			local: true,
			onReady: resolve,
		});
	});
}
