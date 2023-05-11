import { fetch, Request } from "undici";
import { startApiDev, startDev } from "../dev";
import { logger } from "../logger";

import type { Environment } from "../config";
import type { Rule } from "../config/environment";
import type { EnablePagesAssetsServiceBindingOptions } from "../miniflare-cli/types";
import type { RequestInit, Response, RequestInfo } from "undici";

export interface UnstableDevOptions {
	config?: string; // Path to .toml configuration file, relative to cwd
	env?: string; // Environment to use for operations and .env files
	ip?: string; // IP address to listen on
	port?: number; // Port to listen on
	bundle?: boolean; // Set to false to skip internal build steps and directly publish script
	inspectorPort?: number; // Port for devtools to connect to
	localProtocol?: "http" | "https"; // Protocol to listen to requests on, defaults to http.
	assets?: string; // Static assets to be served
	site?: string; // Root folder of static assets for Workers Sites
	siteInclude?: string[]; // Array of .gitignore-style patterns that match file or directory names from the sites directory. Only matched items will be uploaded.
	siteExclude?: string[]; // Array of .gitignore-style patterns that match file or directory names from the sites directory. Matched items will not be uploaded.
	nodeCompat?: boolean; // Enable Node.js compatibility
	compatibilityDate?: string; // Date to use for compatibility checks
	compatibilityFlags?: string[]; // Flags to use for compatibility checks
	persist?: boolean; // Enable persistence for local mode, using default path: .wrangler/state
	persistTo?: string; // Specify directory to use for local persistence (implies --persist)
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
	processEntrypoint?: boolean;
	moduleRoot?: string;
	rules?: Rule[];
	logLevel?: "none" | "info" | "error" | "log" | "warn" | "debug"; // Specify logging level  [choices: "debug", "info", "log", "warn", "error", "none"] [default: "log"]
	inspect?: boolean;
	local?: boolean;
	accountId?: string;
	experimental?: {
		d1Databases?: Environment["d1_databases"];
		disableExperimentalWarning?: boolean; // Disables wrangler's warning when unstable APIs are used.
		disableDevRegistry?: boolean; // Disables wrangler's support multi-worker setups. May reduce flakiness when used in tests in CI.
		enablePagesAssetsServiceBinding?: EnablePagesAssetsServiceBindingOptions;
		experimentalLocal?: boolean; // Use Miniflare 3 instead of Miniflare 2
		experimentalLocalRemoteKv?: boolean;
		forceLocal?: boolean;
		liveReload?: boolean; // Auto reload HTML pages when change is detected in local mode
		showInteractiveDevSession?: boolean;
		testMode?: boolean; // This option shouldn't be used - We plan on removing it eventually
		testScheduled?: boolean; // Test scheduled events by visiting /__scheduled in browser
		watch?: boolean; // unstable_dev doesn't support watch-mode yet in testMode
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
	// Note that not every experimental option is passed directly through to the underlying dev API - experimental options can be used here in unstable_dev. Otherwise we could just pass experimental down to dev blindly.

	const experimentalOptions = {
		// Defaults for "experimental" options
		disableDevRegistry: false,
		disableExperimentalWarning: false,
		showInteractiveDevSession: false,
		testMode: true,
		// Override all options, including overwriting with "undefined"
		...options?.experimental,
	};

	const {
		// there are two types of "experimental" options:
		// 1. options to unstable_dev that we're still testing or are unsure of
		disableDevRegistry,
		disableExperimentalWarning,
		forceLocal,
		liveReload,
		showInteractiveDevSession,
		testMode,
		testScheduled,
		// 2. options for alpha/beta products/libs
		d1Databases,
		experimentalLocal,
		experimentalLocalRemoteKv,
		enablePagesAssetsServiceBinding,
	} = experimentalOptions;

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
					_: [],
					$0: "",
					port: options?.port ?? 0,
					local: true,
					d1Databases,
					disableDevRegistry,
					testScheduled: testScheduled ?? false,
					experimentalLocal: experimentalLocal ?? false,
					experimentalLocalRemoteKv: experimentalLocalRemoteKv ?? false,
					enablePagesAssetsServiceBinding,
					liveReload,
					showInteractiveDevSession,
					onReady: (address, port) => {
						readyPort = port;
						readyAddress = address;
						ready(devServer);
					},
					config: options?.config,
					env: options?.env,
					processEntrypoint: !!options?.processEntrypoint,
					bundle: options?.bundle,
					compatibilityDate: options?.compatibilityDate,
					compatibilityFlags: options?.compatibilityFlags,
					ip: options?.ip,
					inspectorPort: options?.inspectorPort,
					v: undefined,
					localProtocol: options?.localProtocol,
					assets: options?.assets,
					site: options?.site, // Root folder of static assets for Workers Sites
					siteInclude: options?.siteInclude, // Array of .gitignore-style patterns that match file or directory names from the sites directory. Only matched items will be uploaded.
					siteExclude: options?.siteExclude, // Array of .gitignore-style patterns that match file or directory names from the sites directory. Matched items will not be uploaded.
					nodeCompat: options?.nodeCompat, // Enable Node.js compatibility
					persist: options?.persist, // Enable persistence for local mode, using default path: .wrangler/state
					persistTo: options?.persistTo, // Specify directory to use for local persistence (implies --persist)
					experimentalJsonConfig: undefined,
					name: undefined,
					noBundle: false,
					format: undefined,
					latest: false,
					routes: undefined,
					host: undefined,
					localUpstream: undefined,
					experimentalPublic: undefined,
					upstreamProtocol: undefined,
					var: undefined,
					define: undefined,
					jsxFactory: undefined,
					jsxFragment: undefined,
					tsconfig: undefined,
					minify: undefined,
					experimentalEnableLocalPersistence: undefined,
					legacyEnv: undefined,
					public: undefined,
					...options,
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
					_: [],
					$0: "",
					logLevel: options?.logLevel ?? "log",
					port: options?.port ?? 0,
					local: true,
					showInteractiveDevSession,
					d1Databases,
					disableDevRegistry,
					testScheduled: testScheduled ?? false,
					experimentalLocal: experimentalLocal ?? false,
					experimentalLocalRemoteKv: experimentalLocalRemoteKv ?? false,
					enablePagesAssetsServiceBinding,
					forceLocal,
					liveReload,
					onReady: (address, port) => {
						readyPort = port;
						readyAddress = address;
						ready(devServer);
					},
					config: options?.config,
					env: options?.env,
					bundle: options?.bundle,
					compatibilityDate: options?.compatibilityDate,
					compatibilityFlags: options?.compatibilityFlags,
					ip: options?.ip,
					inspectorPort: options?.inspectorPort,
					v: undefined,
					localProtocol: options?.localProtocol,
					assets: options?.assets,
					site: options?.site, // Root folder of static assets for Workers Sites
					siteInclude: options?.siteInclude, // Array of .gitignore-style patterns that match file or directory names from the sites directory. Only matched items will be uploaded.
					siteExclude: options?.siteExclude, // Array of .gitignore-style patterns that match file or directory names from the sites directory. Matched items will not be uploaded.
					nodeCompat: options?.nodeCompat, // Enable Node.js compatibility
					persist: options?.persist, // Enable persistence for local mode, using default path: .wrangler/state
					persistTo: options?.persistTo, // Specify directory to use for local persistence (implies --persist)
					experimentalJsonConfig: undefined,
					name: undefined,
					noBundle: false,
					format: undefined,
					latest: false,
					routes: undefined,
					host: undefined,
					localUpstream: undefined,
					experimentalPublic: undefined,
					upstreamProtocol: undefined,
					var: undefined,
					define: undefined,
					jsxFactory: undefined,
					jsxFragment: undefined,
					tsconfig: undefined,
					minify: undefined,
					experimentalEnableLocalPersistence: undefined,
					legacyEnv: undefined,
					public: undefined,
					...options,
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
	input: RequestInfo = "/",
	init?: RequestInit,
	protocol: "http" | "https" = "http"
): [RequestInfo, RequestInit | undefined] {
	if (input instanceof Request) {
		return [input, undefined];
	}
	const url = new URL(`${input}`, `${protocol}://${readyAddress}:${readyPort}`);
	url.protocol = protocol;
	url.hostname = readyAddress;
	url.port = readyPort.toString();
	return [url, init];
}
