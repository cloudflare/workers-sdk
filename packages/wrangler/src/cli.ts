import process from "process";
import { hideBin } from "yargs/helpers";
import {
	unstable_dev,
	DevEnv as unstable_DevEnv,
	unstable_pages,
	startWorker as unstable_startWorker,
} from "./api";
import { FatalError } from "./errors";
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

export * from "./api/integrations";

// Export internal APIs required by the Vitest integration as `unstable_`
export { default as unstable_splitSqlQuery } from "./d1/splitter";

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
	// eslint-disable-next-line @typescript-eslint/no-var-requires
	require("./miniflare-cli/assets").default;
export { generateASSETSBinding as unstable_generateASSETSBinding };

export {
	experimental_readRawConfig,
	type ConfigBindingOptions as Experimental_ConfigBindingOptions,
} from "./config";
export { experimental_patchConfig } from "./config/patch-config";

export {
	startRemoteProxySession as experimental_startRemoteProxySession,
	type StartRemoteProxySessionOptions as experimental_StartRemoteProxySessionOptions,
	maybeStartOrUpdateRemoteProxySession as experimental_maybeStartOrUpdateRemoteProxySession,
	pickRemoteBindings as experimental_pickRemoteBindings,
	type Binding as Unstable_Binding,
	type RemoteProxySession as Experimental_RemoteProxySession,
	convertConfigBindingsToStartWorkerBindings as unstable_convertConfigBindingsToStartWorkerBindings,
} from "./api";
