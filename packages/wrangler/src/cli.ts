/**
 * This file contains:
 *
 * - The main entrypoint for the CLI, which calls `main()` from `index.ts`.
 * - The exports for the public API of the package.
 */

import "cloudflare/shims/web";
import process from "node:process";
import { FatalError } from "@cloudflare/workers-utils";
import { hideBin } from "yargs/helpers";
import {
	convertConfigBindingsToStartWorkerBindings,
	DevEnv,
	getPlatformProxy,
	maybeStartOrUpdateRemoteProxySession,
	startRemoteProxySession,
	startWorker,
	unstable_dev,
	unstable_getDevCompatibilityDate,
	unstable_getDurableObjectClassNameToUseSQLiteMap,
	unstable_getMiniflareWorkerOptions,
	unstable_getVarsForDev,
	unstable_getWorkerNameFromProject,
	unstable_pages,
	unstable_readConfig,
} from "./api";
import { main } from "./index";
import type {
	Binding,
	GetPlatformProxyOptions,
	PlatformProxy,
	RemoteProxySession,
	SourcelessWorkerOptions,
	StartRemoteProxySessionOptions,
	Unstable_Config,
	Unstable_DevOptions,
	Unstable_DevWorker,
	Unstable_MiniflareWorkerOptions,
	Unstable_RawConfig,
	Unstable_RawEnvironment,
} from "./api";
import type { Logger } from "./logger";
import type { Request, Response } from "miniflare";

/**
 * The main entrypoint for the CLI.
 * main only gets called when the script is run directly, not when it's imported as a module.
 */
if (typeof vitest === "undefined" && require.main === module) {
	main(hideBin(process.argv)).catch((e) => {
		// The logging of any error that was thrown from `main()` is handled in the `yargs.fail()` handler.
		// Here we just want to ensure that the process exits with a non-zero code.
		// We don't want to do this inside the `main()` function, since that would kill the process when running our tests.
		const exitCode = (e instanceof FatalError && e.code) || 1;
		process.exit(exitCode);
	});
}

/**
 * Public API.
 */

export {
	unstable_dev,
	unstable_pages,
	DevEnv as unstable_DevEnv,
	startWorker as unstable_startWorker,
	unstable_getVarsForDev,
	unstable_readConfig,
	unstable_getDurableObjectClassNameToUseSQLiteMap,
	unstable_getDevCompatibilityDate,
	unstable_getWorkerNameFromProject,
	getPlatformProxy,
	unstable_getMiniflareWorkerOptions,
};

export type {
	Unstable_DevWorker,
	Unstable_DevOptions,
	Unstable_Config,
	Unstable_RawConfig,
	Unstable_RawEnvironment,
	GetPlatformProxyOptions,
	PlatformProxy,
	SourcelessWorkerOptions,
	Unstable_MiniflareWorkerOptions,
};

export { printBindings as unstable_printBindings } from "./utils/print-bindings";

// Export internal APIs required by the Vitest integration as `unstable_`
export { splitSqlQuery as unstable_splitSqlQuery } from "./d1/splitter";

// `miniflare-cli/assets` dynamically imports`@cloudflare/pages-shared/environment-polyfills`.
// `@cloudflare/pages-shared/environment-polyfills/types.ts` defines `global`
// augmentations that pollute the `import`-site's typing environment.
//
// We `require` instead of `import`ing here to avoid polluting the main
// `wrangler` TypeScript project with the `global` augmentations. This
// relies on the fact that `require` is untyped.
export interface Unstable_ASSETSBindingsOptions {
	log: Logger;
	proxyPort?: number;
	directory?: string;
}
export const unstable_generateASSETSBinding: (
	opts: Unstable_ASSETSBindingsOptions
) => (request: Request) => Promise<Response> =
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	require("./miniflare-cli/assets").default;

export {
	defaultWranglerConfig as unstable_defaultWranglerConfig,
	experimental_readRawConfig,
} from "@cloudflare/workers-utils";

// TODO: consider if we want to keep exporting `experimental_patchConfig` from wrangler.
//       wouldn't it be better for consumers to depend and use it directly from
//       @cloudflare/workers-utils instead?
export { experimental_patchConfig } from "@cloudflare/workers-utils";

export {
	startRemoteProxySession,
	maybeStartOrUpdateRemoteProxySession,
	convertConfigBindingsToStartWorkerBindings as unstable_convertConfigBindingsToStartWorkerBindings,
};
export type { StartRemoteProxySessionOptions, Binding, RemoteProxySession };

export { getDetailsForAutoConfig as experimental_getDetailsForAutoConfig } from "./autoconfig/details";
export { runAutoConfig as experimental_runAutoConfig } from "./autoconfig/run";
export { Framework as experimental_AutoConfigFramework } from "./autoconfig/frameworks/index";

export { experimental_getWranglerCommands } from "./experimental-commands-api";
