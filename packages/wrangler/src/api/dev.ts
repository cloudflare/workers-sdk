import { fetch, Request } from "undici";
import { startApiDev, startDev } from "../dev";
import { logger } from "../logger";

import type { Environment } from "../config";
import type { EnablePagesAssetsServiceBindingOptions } from "../miniflare-cli/types";
import type { RequestInit, Response, RequestInfo } from "undici";

export interface UnstableDevOptions {
	config?: string;
	env?: string;
	ip?: string;
	port?: number;
	bundle?: boolean;
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
	d1Databases?: Environment["d1_databases"];
	logLevel?: "none" | "info" | "error" | "log" | "warn" | "debug";
	logPrefix?: string;
	inspect?: boolean;
	local?: boolean;
	accountId?: string;
	experimental?: {
		disableExperimentalWarning?: boolean;
		disableDevRegistry?: boolean;
		enablePagesAssetsServiceBinding?: EnablePagesAssetsServiceBindingOptions;
		forceLocal?: boolean;
		experimentalLocal?: boolean;
		experimentalLocalRemoteKv?: boolean;
		showInteractiveDevSession?: boolean;
		testMode?: boolean;
		testScheduled?: boolean;
	};
}

export interface UnstableDevWorker {
	port: number;
	address: string;
	stop: () => Promise<void>;
	fetch: (input?: RequestInfo, init?: RequestInit) => Promise<Response>;
	waitUntilExit: () => Promise<void>;
}
/**
 *  unstable_dev starts a wrangler dev server, and returns a promise that resolves with utility functions to interact with it.
 */
export async function unstable_dev(
	script: string,
	options?: UnstableDevOptions,
	apiOptions?: unknown
): Promise<UnstableDevWorker> {
	const {
		testMode = true,
		disableExperimentalWarning = false,
		disableDevRegistry = false,
		testScheduled,
		experimentalLocal,
		experimentalLocalRemoteKv,
	} = options?.experimental ?? {};
	if (apiOptions) {
		logger.error(
			"unstable_dev's third argument (apiOptions) has been deprecated in favor of an `experimental` property within the second argument (options).\nPlease update your code from:\n`await unstable_dev('...', {...}, {...});`\nto:\n`await unstable_dev('...', {..., experimental: {...}});`"
		);
	}

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
		return new Promise<UnstableDevWorker>((resolve) => {
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
					local: true,
					disableDevRegistry,
					testScheduled,
					experimentalLocal,
					experimentalLocalRemoteKv,
					...options,
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
					port: readyPort,
					address: readyAddress,
					stop: devServer.stop,
					fetch: async (input?: RequestInfo, init?: RequestInit) => {
						return await fetch(
							...parseRequestInput(
								readyAddress,
								readyPort,
								input,
								init,
								options?.localProtocol
							)
						);
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

		return new Promise<UnstableDevWorker>((resolve) => {
			//lmao
			return new Promise<Awaited<ReturnType<typeof startDev>>>((ready) => {
				const devServer = startDev({
					script: script,
					inspect: false,
					showInteractiveDevSession: false,
					_: [],
					$0: "",
					local: true,
					testScheduled,
					experimentalLocal,
					experimentalLocalRemoteKv,
					...options,
					onReady: (address, port) => {
						readyPort = port;
						readyAddress = address;
						ready(devServer);
					},
				});
			}).then((devServer) => {
				resolve({
					port: readyPort,
					address: readyAddress,
					stop: devServer.stop,
					fetch: async (input?: RequestInfo, init?: RequestInit) => {
						return await fetch(
							...parseRequestInput(
								readyAddress,
								readyPort,
								input,
								init,
								options?.localProtocol
							)
						);
					},
					waitUntilExit: devServer.devReactElement.waitUntilExit,
				});
			});
		});
	}
}

export function parseRequestInput(
	readyAddress: string,
	readyPort: number,
	input?: RequestInfo,
	init?: RequestInit,
	protocol: "http" | "https" = "http"
): [RequestInfo, RequestInit | undefined] {
	if (input instanceof Request) {
		return [input, undefined];
	} else if (input instanceof URL) {
		input = `${protocol}://${readyAddress}:${readyPort}${input.pathname}`;
	} else if (typeof input === "string") {
		try {
			// Want to strip the URL to only get the pathname, but the user could pass in only the pathname
			// Will error if we try and pass "/something" into new URL("/something")
			input = `${protocol}://${readyAddress}:${readyPort}${
				new URL(input).pathname
			}`;
		} catch {
			input = `${protocol}://${readyAddress}:${readyPort}${input}`;
		}
	} else {
		input = `${protocol}://${readyAddress}:${readyPort}`;
	}

	return [input, init];
}
