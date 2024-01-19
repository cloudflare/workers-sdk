import { Miniflare } from "miniflare";
import { readConfig } from "../../../config";
import { getBindings } from "../../../dev";
import { getBoundRegisteredWorkers } from "../../../dev-registry";
import { getVarsForDev } from "../../../dev/dev-vars";
import { buildMiniflareBindingOptions } from "../../../dev/miniflare";
import { getServiceBindings } from "./services";
import type { Config } from "../../../config";
import type { MiniflareOptions } from "miniflare";

/**
 * Options for the `getBindingsProxy` utility
 */
export type GetBindingsProxyOptions = {
	/**
	 * The path to the config object to use (default `wrangler.toml`)
	 */
	configPath?: string;
	/**
	 * Flag to indicate the utility to read a json config file (`wrangler.json`)
	 * instead of the toml one (`wrangler.toml`)
	 *
	 * Note: this feature is experimental
	 */
	experimentalJsonConfig?: boolean;
	/**
	 * Indicates if and where to persist the bindings data, if not present or `true` it defaults to the same location
	 * used by wrangler v3: `.wrangler/state/v3` (so that the same data can be easily used by the caller and wrangler).
	 * If `false` is specified no data is persisted on the filesystem.
	 */
	persist?: boolean | { path: string };
};

/**
 * Result of the `getBindingsProxy` utility
 */
export type BindingsProxy<Bindings = Record<string, unknown>> = {
	/**
	 * Object containing the various proxies
	 */
	bindings: Bindings;
	/**
	 * Function used to dispose of the child process providing the bindings implementation
	 */
	dispose: () => Promise<void>;
};

/**
 * By reading from a `wrangler.toml` file this function generates proxy binding objects that can be
 * used to simulate the interaction with bindings during local development in a Node.js environment
 *
 * @param options The various options that can tweak this function's behavior
 * @returns An Object containing the generated proxies alongside other related utilities
 */
export async function getBindingsProxy<Bindings = Record<string, unknown>>(
	options: GetBindingsProxyOptions = {}
): Promise<BindingsProxy<Bindings>> {
	const rawConfig = readConfig(options.configPath, {
		experimentalJsonConfig: options.experimentalJsonConfig,
	});

	// getBindingsProxy doesn't currently support selecting an environment
	const env = undefined;

	const miniflareOptions = await getMiniflareOptionsFromConfig(
		rawConfig,
		env,
		options
	);

	const mf = new Miniflare({
		script: "",
		modules: true,
		...(miniflareOptions as Record<string, unknown>),
	});

	const bindings: Bindings = await mf.getBindings();

	const vars = getVarsForDev(rawConfig, env);

	return {
		bindings: {
			...vars,
			...bindings,
		},
		dispose: () => mf.dispose(),
	};
}

async function getMiniflareOptionsFromConfig(
	rawConfig: Config,
	env: string | undefined,
	options: GetBindingsProxyOptions
): Promise<Partial<MiniflareOptions>> {
	const bindings = getBindings(rawConfig, env, true, {});

	const workerDefinitions = await getBoundRegisteredWorkers({
		services: bindings.services,
		durableObjects: rawConfig["durable_objects"],
	});

	const { bindingOptions, externalDurableObjectWorker } =
		buildMiniflareBindingOptions({
			name: undefined,
			bindings,
			workerDefinitions,
			queueConsumers: undefined,
			serviceBindings: {},
		});

	const persistOptions = getMiniflarePersistOptions(options.persist);

	const serviceBindings = await getServiceBindings(bindings.services);

	const miniflareOptions: MiniflareOptions = {
		workers: [
			{
				script: "",
				modules: true,
				...bindingOptions,
				serviceBindings,
			},
			externalDurableObjectWorker,
		],
		...persistOptions,
	};

	return miniflareOptions;
}

/**
 * Get the persist option properties to pass to miniflare
 *
 * @param persist The user provided persistence option
 * @returns an object containing the properties to pass to miniflare
 */
function getMiniflarePersistOptions(
	persist: GetBindingsProxyOptions["persist"]
): Pick<
	MiniflareOptions,
	"kvPersist" | "durableObjectsPersist" | "r2Persist" | "d1Persist"
> {
	if (persist === false) {
		// the user explicitly asked for no persistance
		return {
			kvPersist: false,
			durableObjectsPersist: false,
			r2Persist: false,
			d1Persist: false,
		};
	}

	const defaultPersistPath = ".wrangler/state/v3";

	const persistPath =
		typeof persist === "object" ? persist.path : defaultPersistPath;

	return {
		kvPersist: `${persistPath}/kv`,
		durableObjectsPersist: `${persistPath}/do`,
		r2Persist: `${persistPath}/r2`,
		d1Persist: `${persistPath}/d1`,
	};
}
