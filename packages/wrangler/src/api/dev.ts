import { fetch, Request } from "undici";
import { startApiDev, startDev } from "../dev";
import { logger } from "../logger";

import type { Environment } from "../config";
import type { Rule } from "../config/environment";
import type { CfModule } from "../deployment-bundle/worker";
import type { StartDevOptions } from "../dev";
import type { EnablePagesAssetsServiceBindingOptions } from "../miniflare-cli/types";
import type { ProxyData } from "./startDevWorker";
import type { Json } from "miniflare";
import type { RequestInit, Response, RequestInfo } from "undici";

export interface UnstableDevOptions {
	config?: string; // Path to .toml configuration file, relative to cwd
	env?: string; // Environment to use for operations and .env files
	ip?: string; // IP address to listen on
	port?: number; // Port to listen on
	bundle?: boolean; // Set to false to skip internal build steps and directly deploy script
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
	vars?: Record<string, string | Json>;
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
	services?: {
		binding: string;
		service: string;
		environment?: string | undefined;
	}[];
	r2?: {
		binding: string;
		bucket_name: string;
		preview_bucket_name?: string;
	}[];
	moduleRoot?: string;
	rules?: Rule[];
	logLevel?: "none" | "info" | "error" | "log" | "warn" | "debug"; // Specify logging level  [choices: "debug", "info", "log", "warn", "error", "none"] [default: "log"]
	inspect?: boolean;
	local?: boolean;
	accountId?: string;
	updateCheck?: boolean;
	experimental?: {
		processEntrypoint?: boolean;
		additionalModules?: CfModule[];
		d1Databases?: Environment["d1_databases"];
		disableExperimentalWarning?: boolean; // Disables wrangler's warning when unstable APIs are used.
		disableDevRegistry?: boolean; // Disables wrangler's support multi-worker setups. May reduce flakiness when used in tests in CI.
		enablePagesAssetsServiceBinding?: EnablePagesAssetsServiceBindingOptions;
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
	proxyData: ProxyData;
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
		processEntrypoint = false,
		additionalModules,
		disableDevRegistry,
		disableExperimentalWarning,
		forceLocal,
		liveReload,
		showInteractiveDevSession,
		testMode,
		testScheduled,
		// 2. options for alpha/beta products/libs
		d1Databases,
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

	type ReadyInformation = {
		address: string;
		port: number;
		proxyData: ProxyData;
	};
	let readyResolve: (info: ReadyInformation) => void;
	const readyPromise = new Promise<ReadyInformation>((resolve) => {
		readyResolve = resolve;
	});

	const defaultLogLevel = testMode ? "none" : "log";
	const local = options?.local ?? true;

	const devOptions: StartDevOptions = {
		script: script,
		inspect: false,
		_: [],
		$0: "",
		remote: !local,
		local,
		experimentalLocal: undefined,
		d1Databases,
		disableDevRegistry,
		testScheduled: testScheduled ?? false,
		enablePagesAssetsServiceBinding,
		forceLocal,
		liveReload,
		showInteractiveDevSession,
		onReady: (address, port, proxyData) => {
			readyResolve({ address, port, proxyData });
		},
		config: options?.config,
		env: options?.env,
		processEntrypoint,
		additionalModules,
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
		logLevel: options?.logLevel ?? defaultLogLevel,
		port: options?.port ?? 0,
		updateCheck: options?.updateCheck ?? false,
	};

	//due to Pages adoption of unstable_dev, we can't *just* disable rebuilds and watching. instead, we'll have two versions of startDev, which will converge.
	if (testMode) {
		// in testMode, we can run multiple wranglers in parallel, but rebuilds might not work out of the box
		// once the devServer is ready for requests, we resolve the ready promise
		const devServer = await startApiDev(devOptions);
		const { port, address, proxyData } = await readyPromise;
		return {
			port,
			address,
			proxyData,
			stop: devServer.stop,
			fetch: async (input?: RequestInfo, init?: RequestInit) => {
				return await fetch(
					...parseRequestInput(
						address,
						port,
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
		};
	} else {
		//outside of test mode, rebuilds work fine, but only one instance of wrangler will work at a time
		const devServer = await startDev(devOptions);
		const { port, address, proxyData } = await readyPromise;
		return {
			port,
			address,
			proxyData,
			stop: devServer.stop,
			fetch: async (input?: RequestInfo, init?: RequestInit) => {
				return await fetch(
					...parseRequestInput(
						address,
						port,
						input,
						init,
						options?.localProtocol
					)
				);
			},
			waitUntilExit: devServer.devReactElement.waitUntilExit,
		};
	}
}

export function parseRequestInput(
	readyAddress: string,
	readyPort: number,
	input: RequestInfo = "/",
	init?: RequestInit,
	protocol: "http" | "https" = "http"
): [RequestInfo, RequestInit] {
	// Make sure URL is absolute
	if (typeof input === "string") input = new URL(input, "http://placeholder");
	// Adapted from Miniflare 3's `dispatchFetch()` function
	const forward = new Request(input, init);
	const url = new URL(forward.url);
	forward.headers.set("MF-Original-URL", url.toString());
	forward.headers.set("MF-Disable-Pretty-Error", "true");
	url.protocol = protocol;
	url.hostname = readyAddress;
	url.port = readyPort.toString();
	// Remove `Content-Length: 0` headers from requests when a body is set to
	// avoid `RequestContentLengthMismatch` errors
	if (forward.body !== null && forward.headers.get("Content-Length") === "0") {
		forward.headers.delete("Content-Length");
	}
	return [url, forward as RequestInit];
}
