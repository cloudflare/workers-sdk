import "cloudflare/shims/web";
import process from "node:process";
import { FatalError } from "@cloudflare/workers-utils";
import { hideBin } from "yargs/helpers";
import {
	unstable_dev,
	DevEnv as unstable_DevEnv,
	unstable_pages,
	startWorker as unstable_startWorker,
} from "./api";
import { main } from ".";
import type { Unstable_DevOptions, Unstable_DevWorker } from "./api";
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
 * This is how we're exporting the API.
 * It makes it possible to import wrangler from 'wrangler',
 * and call wrangler.unstable_dev().
 */
export { unstable_dev, unstable_pages, unstable_DevEnv, unstable_startWorker };
export type { Unstable_DevWorker, Unstable_DevOptions };
export { printBindings as unstable_printBindings } from "./utils/print-bindings";
export * from "./api/integrations";

// Export internal APIs required by the Vitest integration as `unstable_`
export { default as unstable_splitSqlQuery } from "./commands/d1/splitter";

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
const generateASSETSBinding: (
	opts: Unstable_ASSETSBindingsOptions
) => (request: Request) => Promise<Response> =
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	require("./miniflare-cli/assets").default;
export { generateASSETSBinding as unstable_generateASSETSBinding };

export {
	defaultWranglerConfig as unstable_defaultWranglerConfig,
	experimental_readRawConfig,
	type ConfigBindingOptions as Experimental_ConfigBindingOptions,
} from "@cloudflare/workers-utils";

// TODO: consider if we want to keep exporting `experimental_patchConfig` from wrangler.
//       wouldn't it be better for consumers to depend and use it directly from
//       @cloudflare/workers-utils instead?
export { experimental_patchConfig } from "@cloudflare/workers-utils";

export {
	startRemoteProxySession,
	type StartRemoteProxySessionOptions,
	maybeStartOrUpdateRemoteProxySession,
	type Binding,
	type RemoteProxySession,
	convertConfigBindingsToStartWorkerBindings as unstable_convertConfigBindingsToStartWorkerBindings,
} from "./api";

export { getDetailsForAutoConfig as experimental_getDetailsForAutoConfig } from "./autoconfig/details";
export { runAutoConfig as experimental_runAutoConfig } from "./autoconfig/run";
export { Framework as experimental_AutoConfigFramework } from "./autoconfig/frameworks/index";

export { experimental_getWranglerCommands } from "./experimental-commands-api";
