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

	return new Promise<void>((resolve) => {
		//startDev returns a stop function... how do we simulultaneously resolve here, and pass the result of startDev to the caller?
		return startDev({
			script: script,
			...options,
			local: true,
			onReady: resolve,
			inspect: false,
			logLevel: "none",
			showInteractiveDevSession: false,
		});
	});
}
