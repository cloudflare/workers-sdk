import { fetch } from "undici";
import { startApiDev, startDev } from "../dev";
import { logger } from "../logger";

import type { EnablePagesAssetsServiceBindingOptions } from "../miniflare-cli";
import type { RequestInit, Response } from "undici";

interface DevOptions {
	config?: string;
	env?: string;
	ip?: string;
	port?: number;
	inspectorPort?: number;
	localProtocol?: "http" | "https";
	assets?: string;
	site?: string;
	siteInclude?: string[];
	siteExclude?: string[];
	nodeCompat?: boolean;
	compatibilityDate?: string;
	compatibilityFlags?: string[];
	persist?: boolean;
	persistTo?: string;
	liveReload?: boolean;
	watch?: boolean;
	vars?: {
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
	r2?: {
		binding: string;
		bucket_name: string;
		preview_bucket_name?: string;
	}[];
	showInteractiveDevSession?: boolean;
	logLevel?: "none" | "error" | "log" | "warn" | "debug";
	logPrefix?: string;
	inspect?: boolean;
	forceLocal?: boolean;
	enablePagesAssetsServiceBinding?: EnablePagesAssetsServiceBindingOptions;
	_?: (string | number)[]; //yargs wants this
	$0?: string; //yargs wants this
}

interface DevApiOptions {
	testMode?: boolean;
	disableExperimentalWarning?: boolean;
}

interface UnstableDev {
	stop: () => Promise<void>;
	fetch: (init?: RequestInit) => Promise<Response | undefined>;
	waitUntilExit: () => Promise<void>;
}
/**
 *  unstable_dev starts a wrangler dev server, and returns a promise that resolves with utility functions to interact with it.
 *  @param {string} script
 *  @param {DevOptions} options
 *  @param {DevApiOptions} apiOptions
 * @returns {Promise<UnstableDev>}
 */
export async function unstable_dev(
	script: string,
	options?: DevOptions,
	apiOptions?: DevApiOptions
) {
	const { testMode = true, disableExperimentalWarning = false } =
		apiOptions || {};
	if (!disableExperimentalWarning) {
		logger.warn(
			`unstable_dev() is experimental\nunstable_dev()'s behaviour will likely change in future releases`
		);
	}
	let readyPort: number;
	let readyAddress: string;
	//due to Pages adoption of unstable_dev, we can't *just* disable rebuilds and watching. instead, we'll have two versions of startDev, which will converge.
	if (testMode) {
		//in testMode, we can run multiple wranglers in parallel, but rebuilds might not work out of the box
		return new Promise<UnstableDev>((resolve) => {
			//lmao
			return new Promise<Awaited<ReturnType<typeof startApiDev>>>((ready) => {
				// once the devServer is ready for requests, we resolve the inner promise
				// (where we've named the resolve function "ready")
				const devServer = startApiDev({
					script: script,
					inspect: false,
					logLevel: "none",
					showInteractiveDevSession: false,
					_: [],
					$0: "",
					port: options?.port ?? 0,
					...options,
					local: true,
					onReady: (address, port) => {
						readyPort = port;
						readyAddress = address;
						ready(devServer);
					},
				});
			}).then((devServer) => {
				// now that the inner promise has resolved, we can resolve the outer promise
				// with an object that lets you fetch and stop the dev server
				resolve({
					stop: devServer.stop,
					fetch: async (init?: RequestInit) => {
						const urlToFetch = `http://${readyAddress}:${readyPort}/`;
						return await fetch(urlToFetch, init);
					},
					//no-op, does nothing in tests
					waitUntilExit: async () => {
						return;
					},
				});
			});
		});
	} else {
		//outside of test mode, rebuilds work fine, but only one instance of wrangler will work at a time

		return new Promise<UnstableDev>((resolve) => {
			//lmao
			return new Promise<Awaited<ReturnType<typeof startDev>>>((ready) => {
				const devServer = startDev({
					script: script,
					inspect: false,
					logLevel: "none",
					showInteractiveDevSession: false,
					_: [],
					$0: "",
					...options,
					local: true,
					onReady: (address, port) => {
						readyPort = port;
						readyAddress = address;
						ready(devServer);
					},
				});
			}).then((devServer) => {
				resolve({
					stop: devServer.stop,
					fetch: async (init?: RequestInit) => {
						const urlToFetch = `http://${readyAddress}:${readyPort}/`;
						return await fetch(urlToFetch, init);
					},
					waitUntilExit: devServer.devReactElement.waitUntilExit,
				});
			});
		});
	}
}
