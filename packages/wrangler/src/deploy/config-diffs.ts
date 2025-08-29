import { green, red } from "@cloudflare/cli/colors";
import { Diff } from "../cloudchamber/helpers/diff";
import { getResolvedWorkersDev } from "../triggers/deploy";
import type { Config, RawConfig } from "../config";

/**
 * Object representing the difference of two configuration objects.
 */
type ConfigDiff = {
	/** The actual (raw) computed diff of the two objects */
	diff: Diff;
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

	const diff = new Diff(
		JSON.stringify(normalizedRemoteConfig, null, 2),
		JSON.stringify(normalizedLocalConfig, null, 2)
	);

	return {
		diff,
		nonDestructive: configDiffOnlyHasAdditionsIfAny(diff),
	};
}

/**
 * Given a diff object, representing the diff of config files, it computes whether such diff
 * object only represents at most additions (so no removal nor modifications).
 *
 * For example the diff:
 *  ```
 *   - "name": "my-worker"
 *   + "name": "my-worker",
 *   + "vars": {
 *   +   MY_VAR: "my variable",
 *   + },
 *  ```
 * only contains additions.
 *
 * While
 *  ```
 *    "name": "my-worker",
 *    "vars": {
 *   -   MY_VAR: "my variable",
 *   +   MY_VAR: "my modified variable",
 *    },
 *	 - compatibility_date: "2025-07-08",
 *  ```
 * contains also a modification and a removal
 *
 * @param diff The diff object to analyze
 * @returns true if there are only additions or no diffs at all, false otherwise
 */
function configDiffOnlyHasAdditionsIfAny(diff: Diff): boolean {
	const diffLines = diff.toString().split("\n");
	const removalLines = diffLines.filter((line) => {
		const withoutLeadingSpaces = line.replace(/^\s*/, "");
		return withoutLeadingSpaces.startsWith(red("-"));
	});
	const diffLinesSet = new Set(diffLines);
	return removalLines.every((line) => {
		if (line.endsWith(",")) {
			const removalButAsAdditionAndWithCommaRemoved = `${line.slice(0, -1).replace(red("-"), green("+"))}`;
			return diffLinesSet.has(removalButAsAdditionAndWithCommaRemoved);
		}
		const removalButAsAdditionAndWithComma = `${line.replace(red("-"), green("+"))},`;
		return diffLinesSet.has(removalButAsAdditionAndWithComma);
	});
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
	const normalizedConfig: Config = {
		...localResolvedConfig,
		observability: normalizeObservability(localResolvedConfig.observability),
		workers_dev: getResolvedWorkersDev(
			localResolvedConfig.workers_dev,
			localResolvedConfig.routes ?? []
		),
	};

	return normalizedConfig;
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

	const fullObservabilityDefaults = {
		enabled: false,
		head_sampling_rate: 1,
		logs: { enabled: false, head_sampling_rate: 1, invocation_logs: true },
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

	Object.entries(localResolvedConfig).forEach(([key, value]) => {
		// We want to skip observability since it has a remote default behavior
		// different from that or wrangler
		if (key !== "observability") {
			(normalizedRemote as unknown as Record<string, unknown>)[key] = value;
		}
	});

	Object.entries(remoteConfig).forEach(([key, value]) => {
		if (key !== "main" && value !== undefined) {
			(normalizedRemote as unknown as Record<string, unknown>)[key] = value;
		}
	});

	if (normalizedRemote.observability) {
		if (
			normalizedRemote.observability.head_sampling_rate === 1 &&
			localResolvedConfig.observability?.head_sampling_rate === undefined
		) {
			// Note: remotely head_sampling_rate always defaults to 1 even if enabled is false
			delete normalizedRemote.observability.head_sampling_rate;
		}

		if (normalizedRemote.observability.logs) {
			if (
				normalizedRemote.observability.logs.head_sampling_rate === 1 &&
				localResolvedConfig.observability?.logs?.head_sampling_rate ===
					undefined
			) {
				// Note: remotely logs.head_sampling_rate always defaults to 1 even if enabled is false
				delete normalizedRemote.observability.logs.head_sampling_rate;
			}

			if (
				normalizedRemote.observability.logs.invocation_logs === true &&
				localResolvedConfig.observability?.logs?.invocation_logs === undefined
			) {
				// Note: remotely logs.invocation_logs always defaults to 1 even if enabled is false
				delete normalizedRemote.observability.logs.invocation_logs;
			}
		}
	}

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
