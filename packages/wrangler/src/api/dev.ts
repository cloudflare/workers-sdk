import { startDev } from "../dev";
import { logger } from "../logger";

import type { MiniflareCLIOptions } from "../miniflare-cli";
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
	showInteractiveDevSession?: boolean;
	liveReload?: boolean;
	vars: {
		[key: string]: unknown;
	};
	kv?: {
		binding: string;
		id: string;
		preview_id?: string;
	}[];
	durableObjects?: {
		name: string;
		class_name: string;
		script_name?: string | undefined;
		environment?: string | undefined;
	}[];
	miniflareCLIOptions?: MiniflareCLIOptions;
	watch?: boolean;
	compatibilityDate?: string;
	logLevel?: "none" | "error" | "log" | "warn" | "debug";
	cfFetch?: boolean;

	forceLocal?: boolean;
	_: (string | number)[]; //yargs wants this
	$0: string; //yargs wants this
}
/**
 *  unstable_dev starts a wrangler dev server, and returns a promise that resolves with utility functions to interact with it.
 *  @param {string} script
 *  @param {DevOptions} options
 */
export async function unstable_dev(
	script: string,
	options: DevOptions,
	disableWarning?: boolean
) {
	if (!disableWarning) {
		logger.warn(
			`unstable_dev() is experimental\nunstable_dev()'s behaviour will likely change in future releases`
		);
	}

	return new Promise<{
		stop: () => void;
		fetch: (init?: RequestInit) => Promise<Response | undefined>;
	}>((resolve) => {
		//lmao
		return new Promise<Awaited<ReturnType<typeof startDev>>>((ready) => {
			const devServer = startDev({
				script: script,
				showInteractiveDevSession: false,
				...options,
				local: true,
				onReady: () => ready(devServer),
				inspect: false,
				logLevel: "none",
			});
		}).then((devServer) => {
			resolve({
				stop: devServer.stop,
				fetch: devServer.fetch,
			});
		});
	});
}
