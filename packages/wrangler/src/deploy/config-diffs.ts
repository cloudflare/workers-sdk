import { green, red } from "@cloudflare/cli/colors";
import { Diff } from "../cloudchamber/helpers/diff";
import type { Config, RawConfig } from "../config";

/**
 * Object representing the difference of two configuration objects.
 */
type ConfigDiff = {
	/** The actual (raw) computed diff of the two objects */
	diff: Diff;
	/** Boolean indicating whether the difference is not present or only comprized of the addition of configuration options */
	onlyAdditionsIfAny: boolean;
};

/**
 * Computes the difference between a remote representation of a Worker's config and a local configuration.
 *
 * @param remoteConfig The remote representation of a Worker's config
 * @param localConfig The local config
 * @param localResolvedConfig The resolved local config (used to resolve some values on the raw config)
 * @returns Object containing the diffing information
 */
export function getRemoteConfigDiff(
	remoteConfig: RawConfig,
	localConfig: RawConfig,
	localResolvedConfig: Config
): ConfigDiff {
	const normalizedLocal = normalizeLocalConfigAsRemote(
		localConfig,
		localResolvedConfig
	);

	// We reorder the remote config so that its ordering follows that
	// of the local one (this ensures that the diff users see lists
	// the configuration options in the same order as their config file)
	const reorderedRemoteConfig: RawConfig = orderObjectFields(
		remoteConfig as Record<string, unknown>,
		localConfig as Record<string, unknown>
	);

	const diff = new Diff(
		JSON.stringify(reorderedRemoteConfig, null, 2),
		JSON.stringify(normalizedLocal, null, 2)
	);

	return {
		diff,
		onlyAdditionsIfAny: configDiffOnlyHasAdditionsIfAny(diff),
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
	const diffLines = `${diff}`.split("\n");
	let currentRemovalIdx = 0;
	while (currentRemovalIdx !== -1) {
		const nextRemovalIdx = diffLines.findIndex((line, idx) => {
			// We only consider values after the currentRemovalIdx (which is practically our starting index)
			if (idx < currentRemovalIdx) {
				return false;
			}

			const withoutLeadingSpaces = line.replace(/^\s*/, "");
			return withoutLeadingSpaces.startsWith(red("-"));
		});
		if (nextRemovalIdx === -1) {
			// We've looked for all the removals none were actually modifications
			// so we return true, at most the changes in the diff are additions
			return true;
		}
		currentRemovalIdx = nextRemovalIdx;
		const lineAtIdx = diffLines[currentRemovalIdx];
		const nextLine = diffLines[currentRemovalIdx + 1] ?? "";
		const lineAtIdxButAdditionAndWithComma = `${lineAtIdx.replace(red("-"), green("+"))},`;
		// onlyACommaWasAdded indicates that only a single comma was added, so
		// for example, `lineAtIdx` is `'- "field": "test"'` and `nextLine` is `'+ "field': "test",`
		const onlyACommaWasAdded = nextLine === lineAtIdxButAdditionAndWithComma;
		if (!onlyACommaWasAdded) {
			// if there is a removal and the change wasn't the simple addition of a comma
			// then we've found a real removal/modification, so let's return false
			return false;
		}
		// otherwise this wasn't a real removal/modification so we continue looking for one
		currentRemovalIdx++;
	}
	// we didn't find any real removal/modification
	return true;
}

/**
 * Normalizes a local config object into an object that can be compared to the remote representation of
 * a Worker's config. This includes resolving some values and setting the default values to some others.
 *
 * @param localConfig The local config to normalize
 * @param localResolvedConfig The resolved local config (used to resolve some values on the raw config)
 * @returns The local config normalized, ready to be compared to a remote one
 */
function normalizeLocalConfigAsRemote(
	localConfig: RawConfig,
	localResolvedConfig: Config
): RawConfig {
	const asRemoteConfig: RawConfig = Object.fromEntries(
		Object.entries(localConfig).filter(([key]) => remoteConfigKeys.has(key))
	);

	if ("main" in asRemoteConfig) {
		// For the main field we want to consider the normalized/resolved value
		asRemoteConfig.main = localResolvedConfig.main;
	}

	if (asRemoteConfig.observability === undefined) {
		asRemoteConfig.observability = {
			enabled: true,
			head_sampling_rate: 1,
		};
	}

	if (asRemoteConfig.observability.enabled === undefined) {
		asRemoteConfig.observability.enabled = true;
	}

	// The remote config defaults `head_sampling_rate` to `1`
	// while wrangler defaults it to `undefined`
	if (asRemoteConfig.observability.head_sampling_rate === undefined) {
		asRemoteConfig.observability.head_sampling_rate = 1;
	}

	if (
		asRemoteConfig.observability.logs &&
		asRemoteConfig.observability.logs.enabled === undefined
	) {
		asRemoteConfig.observability.logs.enabled = true;
	}

	if (asRemoteConfig.workers_dev === undefined) {
		// The remote config defaults `workers_dev` to `true`
		// while wrangler defaults it to `undefined`
		asRemoteConfig.workers_dev = true;
	}

	return asRemoteConfig;
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
 * Set of config keys that are part of the remote Worker's config representation we construct.
 *
 * Or in other words the following contains all the possible fields that can be present in the
 * object returned from the `downloadWorkerConfig` function
 *
 */
const remoteConfigKeys = new Set<string>([
	"name",
	"main",
	"workers_dev",
	"compatibility_date",
	"compatibility_flags",
	"routes",
	"placement",
	"limits",
	"migrations",
	"triggers",
	"tail_consumers",
	"observability",
	"vars",
	"kv_namespaces",
	"durable_objects",
	"d1_databases",
	"browser",
	"ai",
	"images",
	"r2_buckets",
	"secrets_store_secrets",
	"unsafe_hello_world",
	"services",
	"analytics_engine_datasets",
	"dispatch_namespaces",
	"logfwdr",
	"wasm_modules",
	"text_blobs",
	"data_blobs",
	"version_metadata",
	"send_email",
	"queues",
	"vectorize",
	"hyperdrive",
	"mtls_certificates",
	"pipelines",
	"unsafe",
	"workflows",
] satisfies (keyof RawConfig)[]);
