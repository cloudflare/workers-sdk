import events from "node:events";
import { fetch, Request } from "undici";
import { startDev } from "../dev";
import { getDockerPath } from "../environment-variables/misc-variables";
import { run } from "../experimental-flags";
import { logger } from "../logger";
import type { Environment } from "../config";
import type { Rule } from "../config/environment";
import type { CfModule } from "../deployment-bundle/worker";
import type { StartDevOptions } from "../dev";
import type { EnablePagesAssetsServiceBindingOptions } from "../miniflare-cli/types";
import type { Json } from "miniflare";
import type { RequestInfo, RequestInit, Response } from "undici";

export interface Unstable_DevOptions {
	config?: string; // Path to .toml configuration file, relative to cwd
	env?: string; // Environment to use for operations, and for selecting .env and .dev.vars files
	envFiles?: string[]; // Paths to .env files to load, relative to cwd
	ip?: string; // IP address to listen on
	port?: number; // Port to listen on
	bundle?: boolean; // Set to false to skip internal build steps and directly deploy script
	inspectorPort?: number; // Port for devtools to connect to
	localProtocol?: "http" | "https"; // Protocol to listen to requests on, defaults to http.
	httpsKeyPath?: string;
	httpsCertPath?: string;
	assets?: string; // Static assets to be served
	site?: string; // Root folder of static assets for Workers Sites
	siteInclude?: string[]; // Array of .gitignore-style patterns that match file or directory names from the sites directory. Only matched items will be uploaded.
	siteExclude?: string[]; // Array of .gitignore-style patterns that match file or directory names from the sites directory. Matched items will not be uploaded.
	compatibilityDate?: string; // Date to use for compatibility checks
	compatibilityFlags?: string[]; // Flags to use for compatibility checks
	persist?: boolean; // Enable persistence for local mode, using default path: .wrangler/state
	persistTo?: string; // Specify directory to use for local persistence (implies --persist)
	vars?: Record<string, string | Json>;
	kv?: {
		binding: string;
		id?: string;
		preview_id?: string;
		remote?: boolean;
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
		entrypoint?: string | undefined;
		remote?: boolean;
	}[];
	r2?: {
		binding: string;
		bucket_name?: string;
		preview_bucket_name?: string;
		remote?: boolean;
	}[];
	ai?: {
		binding: string;
	};
	version_metadata?: {
		binding: string;
	};
	moduleRoot?: string;
	rules?: Rule[];
	logLevel?: "none" | "info" | "error" | "log" | "warn" | "debug"; // Specify logging level  [choices: "debug", "info", "log", "warn", "error", "none"] [default: "log"]
	inspect?: boolean;
	local?: boolean;
	accountId?: string;
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
		devEnv?: boolean;
		fileBasedRegistry?: boolean;
		vectorizeBindToProd?: boolean;
		imagesLocalMode?: boolean;
		enableIpc?: boolean;
		enableContainers?: boolean; // Whether to build and connect to containers in dev mode. Defaults to true.
		dockerPath?: string; // Path to the docker binary, if not on $PATH
		containerEngine?: string; // Docker socket
	};
}

export interface Unstable_DevWorker {
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
	options?: Unstable_DevOptions,
	apiOptions?: unknown
): Promise<Unstable_DevWorker> {
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
		vectorizeBindToProd,
		imagesLocalMode,
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
	};
	let readyResolve: (info: ReadyInformation) => void;
	const readyPromise = new Promise<ReadyInformation>((resolve) => {
		readyResolve = resolve;
	});

	const defaultLogLevel = testMode ? "warn" : "log";
	const local = options?.local ?? true;

	const dockerPath = options?.experimental?.dockerPath ?? getDockerPath();

	const devOptions: StartDevOptions = {
		script: script,
		inspect: false,
		_: [],
		$0: "",
		remote: !local,
		local: undefined,
		d1Databases,
		disableDevRegistry,
		testScheduled: testScheduled ?? false,
		enablePagesAssetsServiceBinding,
		forceLocal,
		liveReload,
		showInteractiveDevSession,
		onReady: (address, port) => {
			readyResolve({ address, port });
		},
		config: options?.config,
		env: options?.env,
		envFile: options?.envFiles,
		processEntrypoint,
		additionalModules,
		bundle: options?.bundle,
		compatibilityDate: options?.compatibilityDate,
		compatibilityFlags: options?.compatibilityFlags,
		ip: "127.0.0.1",
		inspectorPort: options?.inspectorPort ?? 0,
		v: undefined,
		cwd: undefined,
		localProtocol: options?.localProtocol,
		httpsKeyPath: options?.httpsKeyPath,
		httpsCertPath: options?.httpsCertPath,
		assets: undefined,
		site: options?.site, // Root folder of static assets for Workers Sites
		siteInclude: options?.siteInclude, // Array of .gitignore-style patterns that match file or directory names from the sites directory. Only matched items will be uploaded.
		siteExclude: options?.siteExclude, // Array of .gitignore-style patterns that match file or directory names from the sites directory. Matched items will not be uploaded.
		persist: options?.persist, // Enable persistence for local mode, using default path: .wrangler/state
		persistTo: options?.persistTo, // Specify directory to use for local persistence (implies --persist)
		name: undefined,
		noBundle: false,
		latest: false,
		routes: undefined,
		host: undefined,
		localUpstream: undefined,
		upstreamProtocol: undefined,
		var: undefined,
		define: undefined,
		alias: undefined,
		jsxFactory: undefined,
		jsxFragment: undefined,
		tsconfig: undefined,
		minify: undefined,
		legacyEnv: undefined,
		...options,
		logLevel: options?.logLevel ?? defaultLogLevel,
		port: options?.port ?? 0,
		experimentalProvision: undefined,
		experimentalRemoteBindings: false,
		experimentalVectorizeBindToProd: vectorizeBindToProd ?? false,
		experimentalImagesLocalMode: imagesLocalMode ?? false,
		enableIpc: options?.experimental?.enableIpc,
		nodeCompat: undefined,
		enableContainers: options?.experimental?.enableContainers ?? false,
		dockerPath,
		containerEngine: options?.experimental?.containerEngine,
	};

	//outside of test mode, rebuilds work fine, but only one instance of wrangler will work at a time
	const devServer = await run(
		{
			// TODO: can we make this work?
			MULTIWORKER: false,
			RESOURCES_PROVISION: false,
			REMOTE_BINDINGS: false,
			DEPLOY_REMOTE_DIFF_CHECK: false,
		},
		() => startDev(devOptions)
	);
	const { port, address } = await readyPromise;

	return {
		port,
		address,
		stop: async () => {
			await devServer.devEnv.teardown.bind(devServer.devEnv)();
			const teardownRegistry = await devServer.teardownRegistryPromise;
			await teardownRegistry?.(devServer.devEnv.config.latestConfig?.name);

			devServer.unregisterHotKeys?.();
		},
		fetch: async (input?: RequestInfo, init?: RequestInit) => {
			return await fetch(
				...parseRequestInput(address, port, input, init, options?.localProtocol)
			);
		},
		waitUntilExit: async () => {
			await events.once(devServer.devEnv, "teardown");
		},
	};
}

export function parseRequestInput(
	readyAddress: string,
	readyPort: number,
	input: RequestInfo = "/",
	init?: RequestInit,
	protocol: "http" | "https" = "http"
): [RequestInfo, RequestInit] {
	// Make sure URL is absolute
	if (typeof input === "string") {
		input = new URL(input, "http://placeholder");
	}
	// Adapted from Miniflare's `dispatchFetch()` function
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
