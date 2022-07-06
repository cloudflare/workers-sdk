import { startDev } from "../dev";
import { logger } from "../logger";

import type { RequestInit, Response } from "undici";

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
/**
 *  unstable_dev starts a wrangler dev server, and returns a promise that resolves with utility functions to interact with it.
 *  @param {string} script
 *  @param {DevOptions} options
 */
export async function unstable_dev(script: string, options: DevOptions) {
	logger.warn(
		`unstable_dev() is experimental\nunstable_dev()'s behaviour will likely change in future releases`
	);

	return new Promise<{
		stop: () => void;
		fetch: (init?: RequestInit) => Promise<Response | undefined>;
	}>((resolve) => {
		//lmao
		return new Promise<Awaited<ReturnType<typeof startDev>>>((ready) => {
			const devServer = startDev({
				script: script,
				...options,
				local: true,
				onReady: () => ready(devServer),
				inspect: false,
				logLevel: "none",
				showInteractiveDevSession: false,
			});
		}).then((devServer) => {
			resolve({
				stop: devServer.stop,
				fetch: devServer.fetch,
			});
		});
	});
}
