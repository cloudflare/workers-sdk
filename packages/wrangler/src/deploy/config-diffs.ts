import assert from "node:assert";
import { getSubdomainValuesAPIMock } from "../commands/triggers/deploy";
import {
	diffJsonObjects,
	isModifiedDiffValue,
	isNonDestructive,
} from "../utils/diff-json";
import type { JsonLike } from "../utils/diff-json";
import type { Config, RawConfig } from "@cloudflare/workers-utils";

/**
 * Object representing the difference of two configuration objects.
 */
type ConfigDiff = {
	/** The actual (raw) computed diff of the two objects */
	diff: Record<string, JsonLike> | null;
	/**
	 * Flag indicating whether the difference includes some destructive changes.
	 *
	 * In other words, if the second config is not applying any change or only adding options, such diff is considered non destructive, on the other hand if the config is removing or modifying values it is considered destructive instead.
	 */
	nonDestructive: boolean;
};

/**
 * Computes the difference between a remote representation of a Worker's config and a local configuration.
 *
 * @param remoteConfig The remote representation of a Worker's config
 * @param localResolvedConfig The local (resolved) config
 * @returns Object containing the diffing information
 */
export function getRemoteConfigDiff(
	remoteConfig: RawConfig,
	localResolvedConfig: Config
): ConfigDiff {
	const normalizedLocalConfig =
		normalizeLocalResolvedConfigAsRemote(localResolvedConfig);
	const normalizedRemoteConfig = normalizeRemoteConfigAsResolvedLocal(
		remoteConfig,
		localResolvedConfig
	);

	const diff = diffJsonObjects(
		normalizedRemoteConfig as unknown as Record<string, JsonLike>,
		normalizedLocalConfig as unknown as Record<string, JsonLike>
	);

	return {
		diff,
		nonDestructive: isNonDestructive(diff),
	};
}

/**
 * Normalized a local (resolved) config object so that it can be compared against
 * the remote config object. This mainly means resolving and setting defaults to
 * the local configuration to match the values in the remote one.
 *
 * @param localResolvedConfig The local (resolved) config object to normalize
 * @returns The normalized config
 */
function normalizeLocalResolvedConfigAsRemote(
	localResolvedConfig: Config
): Config {
	const subdomainValues = getSubdomainValuesAPIMock(
		localResolvedConfig.workers_dev,
		localResolvedConfig.preview_urls,
		localResolvedConfig.routes ?? []
	);
	const normalizedConfig: Config = {
		...structuredClone(localResolvedConfig),
		workers_dev: subdomainValues.workers_dev,
		preview_urls: subdomainValues.preview_urls,
		observability: normalizeObservability(localResolvedConfig.observability),
	};

	removeRemoteConfigFieldFromBindings(normalizedConfig);

	// Currently remotely we only get the assets' binding name, so we need remove
	// everything else, if present, from the local one
	if (normalizedConfig.assets) {
		normalizedConfig.assets = {
			binding: normalizedConfig.assets.binding,
		};
	}

	return normalizedConfig;
}

/**
 * Given a configuration object removes all the `remote` config settings from all the bindings
 * in the configuration (this is used as part of the config normalization since the `remote`
 * key is not present in the remote configuration object)
 *
 * @param normalizedConfig The target configuration object (which gets updated side-effectfully)
 */
function removeRemoteConfigFieldFromBindings(normalizedConfig: Config): void {
	for (const bindingField of [
		"kv_namespaces",
		"r2_buckets",
		"d1_databases",
	] as const) {
		if (normalizedConfig[bindingField]?.length) {
			normalizedConfig[bindingField] = normalizedConfig[bindingField].map(
				({ remote: _, ...binding }) => binding
			);
		}
	}

	if (normalizedConfig.services?.length) {
		normalizedConfig.services = normalizedConfig.services.map(
			({ remote: _, ...binding }) => binding
		);
	}

	if (normalizedConfig.vpc_services?.length) {
		normalizedConfig.vpc_services = normalizedConfig.vpc_services.map(
			({ remote: _, ...binding }) => binding
		);
	}

	if (normalizedConfig.workflows?.length) {
		normalizedConfig.workflows = normalizedConfig.workflows.map(
			({ remote: _, ...binding }) => binding
		);
	}

	if (normalizedConfig.dispatch_namespaces?.length) {
		normalizedConfig.dispatch_namespaces =
			normalizedConfig.dispatch_namespaces.map(
				({ remote: _, ...binding }) => binding
			);
	}

	if (normalizedConfig.mtls_certificates?.length) {
		normalizedConfig.mtls_certificates = normalizedConfig.mtls_certificates.map(
			({ remote: _, ...binding }) => binding
		);
	}

	if (normalizedConfig.pipelines?.length) {
		normalizedConfig.pipelines = normalizedConfig.pipelines.map(
			({ remote: _, ...binding }) => binding
		);
	}

	if (normalizedConfig.vectorize?.length) {
		normalizedConfig.vectorize = normalizedConfig.vectorize.map(
			({ remote: _, ...binding }) => binding
		);
	}

	if (normalizedConfig.queues?.producers?.length) {
		normalizedConfig.queues.producers = normalizedConfig.queues.producers.map(
			({ remote: _, ...binding }) => binding
		);
	}

	if (normalizedConfig.send_email) {
		normalizedConfig.send_email = normalizedConfig.send_email.map(
			({ remote: _, ...binding }) => binding
		);
	}

	const singleBindingFields = ["browser", "ai", "images", "media"] as const;
	for (const singleBindingField of singleBindingFields) {
		if (
			normalizedConfig[singleBindingField] &&
			"remote" in normalizedConfig[singleBindingField]
		) {
			delete normalizedConfig[singleBindingField].remote;
		}
	}
}

/**
 * Normalizes an observability config object (either the remote or resolved local one) to a fully filled form, this
 * helps us resolve any inconsistencies between the local and remote default values.
 *
 * @param obs The observability config object to normalize
 * @returns The normalized observability object
 */
function normalizeObservability(
	obs: RawConfig["observability"]
): Config["observability"] {
	const normalized = structuredClone(obs);

	const enabled = obs?.enabled === true ? true : false;

	const fullObservabilityDefaults = {
		enabled,
		head_sampling_rate: 1,
		logs: {
			enabled,
			head_sampling_rate: 1,
			invocation_logs: true,
			persist: true,
		},
		traces: { enabled: false, persist: true, head_sampling_rate: 1 },
	} as const;

	if (!normalized) {
		return fullObservabilityDefaults;
	}

	const fillUndefinedFields = (
		target: Record<string, unknown>,
		defaults: Record<string, unknown>
	) => {
		Object.entries(defaults).forEach(([key, value]) => {
			if (target[key] === undefined) {
				target[key] = value;
				return;
			}

			if (
				typeof value === "object" &&
				value !== null &&
				typeof target[key] === "object" &&
				target[key] !== null
			) {
				fillUndefinedFields(
					target[key] as Record<string, unknown>,
					value as Record<string, unknown>
				);
			}
		});
	};

	fillUndefinedFields(
		normalized as Record<string, unknown>,
		fullObservabilityDefaults
	);

	return normalized;
}

/**
 * Normalizes a remote config object (or more precisely our representation of it) into an object that can be
 * compared to the local target config.
 *
 * The normalization is comprized of:
 *  - making sure that the various config fields are in the same order
 *  - adding to the remote config object all the non-remote config keys
 *  - removing from the remote config all the default values that in the local config are either not present or undefined
 *
 * @param remoteConfig The remote config object to normalize
 * @param localResolvedConfig The target/local (resolved) config object
 * @returns The remote config object normalized and ready to be compared with the local one
 */
function normalizeRemoteConfigAsResolvedLocal(
	remoteConfig: RawConfig,
	localResolvedConfig: Config
): Config {
	let normalizedRemote = {} as Config;

	// We start by adding all the local configs to the normalized remote config object
	// in this way we can make sure that local-only configurations are not shown as
	// differences between local and remote configs
	Object.entries(localResolvedConfig).forEach(([key, value]) => {
		if (
			// We want to skip observability since it has a remote default behavior
			// different from that of wrangler
			key !== "observability" &&
			// We want to skip assets since it is a special case, the issue being that
			// remotely assets configs only include at most the binding name and we
			// already address that in the local config normalization already
			key !== "assets"
		) {
			(normalizedRemote as unknown as Record<string, unknown>)[key] = value;
		}
	});

	// We then override the configs present in the remote config object
	Object.entries(remoteConfig).forEach(([key, value]) => {
		if (key !== "main" && value !== undefined) {
			(normalizedRemote as unknown as Record<string, unknown>)[key] = value;
		}
	});

	normalizedRemote.observability = normalizeObservability(
		normalizedRemote.observability
	);

	// We reorder the remote config so that its ordering follows that
	// of the local one (this ensures that the diff users see lists
	// the configuration options in the same order as their config file)
	normalizedRemote = orderObjectFields(
		normalizedRemote as unknown as Record<string, unknown>,
		localResolvedConfig as unknown as Record<string, unknown>
	) as unknown as Config;

	return normalizedRemote;
}

/**
 * This function reorders the fields of a given object so that they follow a given target object.
 * All the fields of the given object not present in the target object will be ordered last.
 *
 * Note: this function also recursively reorders the fields of nested objects
 *
 * For example:
 *  orderObjectFields(
 *    {
 *      d: ''
 *      b: '',
 *      a: '',
 *      e: '',
 *      f: '',
 *    },
 *    {
 *      a: '',
 *      b: '',
 *      c: '',
 *      d: '',
 *    }
 * 	) === {
 *    a: '', // `a` and `b` are the first two fields of the target object, so they go first
 *    b: '',
 *    // the source object doesn't have a `c` field
 *    d: '', // `d` is the next value present in the target object
 *    e: '', // `e` and `f` are not in the target object so they go last
 *    f: '',
 *  }
 *
 * @param source The source object which fields should be ordered
 * @param target The target object which ordering should be followed
 * @returns The source object with its fields reordered
 */
function orderObjectFields<T extends Record<string, unknown>>(
	source: T,
	target: Record<string, unknown>
): T {
	const targetKeysIndexesMap = Object.fromEntries(
		Object.keys(target).map((key, i) => [key, i])
	);

	const orderedSource = Object.fromEntries(
		Object.entries(source).sort(([keyA], [keyB]) => {
			if (keyA in target && !(keyB in target)) {
				return -1;
			}

			if (!(keyA in target) && keyB in target) {
				return 1;
			}

			if (!(keyA in target) && !(keyB in target)) {
				return 0;
			}

			return targetKeysIndexesMap[keyA] - targetKeysIndexesMap[keyB];
		})
	) as T;

	for (const [key, value] of Object.entries(orderedSource)) {
		if (
			typeof value === "object" &&
			value !== null &&
			!Array.isArray(value) &&
			typeof target[key] === "object" &&
			target[key] !== null &&
			!Array.isArray(target[key])
		) {
			(orderedSource as Record<string, unknown>)[key] = orderObjectFields(
				value as Record<string, unknown>,
				target[key] as Record<string, unknown>
			);
		}
	}

	return orderedSource;
}

/**
 * Given a config diff generates a patch object that can be passed to `experimental_patchConfig` to revert the
 * changes in the config object that are described by the config diff.
 *
 * If the config is for a specific target environment, only the environment config object will be targeted for the patch.
 *
 * @param configDiff The target config diff
 * @param targetEnvironment the target environment if any
 * @returns The patch object to pass to `experimental_patchConfig` to revert the changes
 */
export function getConfigPatch(
	configDiff: ConfigDiff["diff"],
	targetEnvironment?: string | undefined
): RawConfig {
	const patchObj: RawConfig = {};

	populateConfigPatch(
		configDiff,
		patchObj as Record<string, JsonLike>,
		targetEnvironment
	);

	return patchObj;
}

/**
 * Recursive call for `getConfigPatch`, it side-effectfully populates the patch object at the current level
 *
 * @param diff The current section of the config diff that is being analyzed
 * @param patchObj The current section of the patch object that is being populated
 * @param targetEnvironment the target environment if any
 */
function populateConfigPatch(
	diff: JsonLike,
	patchObj: Record<string, JsonLike> | JsonLike[],
	targetEnvironment?: string
): void {
	if (!diff || typeof diff !== "object") {
		return;
	}

	if (Array.isArray(diff)) {
		// This is a recursive call since we're populating the
		// patchObj we know that it is an array
		assert(Array.isArray(patchObj));
		return populateConfigPatchArray(diff, patchObj);
	}

	// We know that patchObj is not an array here
	assert(!Array.isArray(patchObj));
	return populateConfigPatchObject(diff, patchObj, targetEnvironment);
}

/**
 * Recursive call for `getConfigPatch`, it side-effectfully populates the array present at the config patch level
 *
 * @param diff The current section of the config diff that is being analyzed
 * @param patchArray The current section of the patch object that is being populated
 */
function populateConfigPatchArray(diff: JsonLike[], patchArray: JsonLike[]) {
	// We create a temporary array since removed elements should be pushed back at the end
	const elementsToAppend: JsonLike[] = [];

	Object.values(diff).forEach((element) => {
		if (!Array.isArray(element)) {
			return;
		}

		if (element.length === 1 && element[0] === " ") {
			// An array with a single element equal to a simple space indicates
			// that the element hasn't been modified
			patchArray.push({});
			return;
		}

		if (element.length === 2) {
			if (element[0] === "-") {
				elementsToAppend.push(element[1]);
				return;
			}

			if (element[0] === "~" && element[1]) {
				const patchEl = {};
				populateConfigPatch(element[1], patchEl);
				patchArray.push(patchEl);
				return;
			}
		}
	});
	elementsToAppend.forEach((el) => patchArray.push(el));
}

/**
 * Recursive call for `getConfigPatch`, it side-effectfully populates the object present at the config patch level
 *
 * @param diff The current section of the config diff that is being analyzed
 * @param patchObj The current section of the patch object that is being populated
 * @param targetEnvironment the target environment if any
 */
function populateConfigPatchObject(
	diff: { [id: string]: JsonLike },
	patchObj: Record<string, JsonLike>,
	targetEnvironment?: string
) {
	const getEnvObj = (targetEnv: string) => {
		patchObj.env ??= {};
		const patchObjEnv = patchObj.env as Record<string, Record<string, unknown>>;
		patchObjEnv[targetEnv] ??= {};
		return patchObjEnv[targetEnv];
	};
	Object.keys(diff)
		.filter((key) => diff[key] && typeof diff[key] === "object")
		.forEach((key) => {
			if (isModifiedDiffValue(diff[key])) {
				if (targetEnvironment) {
					getEnvObj(targetEnvironment)[key] = diff[key].__old;
				} else {
					patchObj[key] = diff[key].__old;
				}
				return;
			}

			if (targetEnvironment) {
				getEnvObj(targetEnvironment)[key] ??= Array.isArray(diff[key])
					? []
					: {};
			} else {
				patchObj[key] ??= Array.isArray(diff[key]) ? [] : {};
			}

			Object.entries(diff[key] as Record<string, JsonLike>).forEach(
				([entryKey, entryValue]) => {
					if (entryKey.endsWith("__deleted")) {
						let patchObjectToUpdate = patchObj[key] as Record<string, unknown>;
						if (targetEnvironment) {
							const envObj = getEnvObj(targetEnvironment);
							envObj[key] ??= {};
							patchObjectToUpdate = envObj[key] as Record<string, unknown>;
						}
						patchObjectToUpdate[entryKey.replace("__deleted", "")] = entryValue;
						return;
					}
				}
			);

			if (diff[key] && typeof diff[key] === "object") {
				populateConfigPatch(
					diff[key],
					(targetEnvironment
						? getEnvObj(targetEnvironment)[key]
						: patchObj[key]) as Record<string, JsonLike> | JsonLike[]
					// Note: we are not passing the target environment since in the recursive calls
					//       we are already one level deep and dealing with the environment specific
					//       patch object
				);
				return;
			}
		});
}
