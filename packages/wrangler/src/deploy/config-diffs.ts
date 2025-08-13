import assert from "node:assert";
import { green, red } from "@cloudflare/cli/colors";
import { Diff } from "../cloudchamber/helpers/diff";
import type { RawConfig } from "../config";

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
 * @param localConfig The local config
 * @returns Object containing the diffing information
 */
export function getRemoteConfigDiff(
	remoteConfig: RawConfig,
	localConfig: RawConfig
): ConfigDiff {
	const diff = new Diff(
		JSON.stringify(
			normalizeRemoteConfigAsLocal(remoteConfig, localConfig),
			null,
			2
		),
		JSON.stringify(localConfig, null, 2)
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
 * Normalizes a remote config object (or more precisely our representation of it) into an object that can be
 * compared to the local target config.
 *
 * The normalization is comprized of:
 *  - making sure that the various config fields are in the same order
 *  - adding to the remote config object all the non-remote config keys
 *  - removing from the remote config all the default values that in the local config are either not present or undefined
 *
 * Important: This operation is important to make sure that the diff out presented to the user looks as close as possible
 *            to their real local configuration. For this reason we do not want to change anything in the local config
 *            and all the changes to adapt the two need to be done on the remote one
 *
 * @param remoteConfig The remote config object to normalize
 * @param localConfig The target/local config object
 * @returns The remote config object normalized and ready to be compared with the local one
 */
function normalizeRemoteConfigAsLocal(
	remoteConfig: RawConfig,
	localConfig: RawConfig
): RawConfig {
	let normalizedRemote: RawConfig = structuredClone(remoteConfig);

	Object.entries(localConfig).forEach(([key, value]) => {
		// Note: we want to copy all the non-remote keys in the local config onto
		//       the remote one, so that in the diffing output those keys will appear
		//       and without being shown/detected as additions
		if (
			!remoteConfigKeys.has(key) ||
			// We also include `main` here since this field can easily change but
			// it changing does not really constitute a relevant config change
			key === "main"
		) {
			normalizedRemote[key as keyof RawConfig] = value;
		}
	});

	cleanupRemoteDefault({
		remoteObj: normalizedRemote as Record<string, unknown>,
		localObj: localConfig as Record<string, unknown>,
		field: "observability",
		remoteDefaultValue: {
			enabled: true,
			head_sampling_rate: 1,
		},
	});

	if (normalizedRemote.observability && localConfig.observability) {
		cleanupRemoteDefault({
			remoteObj: normalizedRemote.observability as Record<string, unknown>,
			localObj: localConfig.observability as Record<string, unknown>,
			field: "enabled",
			remoteDefaultValue: true,
		});

		cleanupRemoteDefault({
			remoteObj: normalizedRemote.observability as Record<string, unknown>,
			localObj: localConfig.observability as Record<string, unknown>,
			field: "head_sampling_rate",
			remoteDefaultValue: 1,
		});

		if (normalizedRemote.observability.logs && localConfig.observability.logs) {
			cleanupRemoteDefault({
				remoteObj: normalizedRemote.observability.logs,
				localObj: localConfig.observability.logs,
				field: "enabled",
				remoteDefaultValue: true,
			});
		}
	}

	cleanupRemoteDefault({
		remoteObj: normalizedRemote as Record<string, unknown>,
		localObj: localConfig as Record<string, unknown>,
		field: "workers_dev",
		remoteDefaultValue: true,
	});

	// We reorder the remote config so that its ordering follows that
	// of the local one (this ensures that the diff users see lists
	// the configuration options in the same order as their config file)
	normalizedRemote = orderObjectFields(
		normalizedRemote as Record<string, unknown>,
		localConfig as Record<string, unknown>
	);

	return normalizedRemote;
}

/**
 * Fields in the remote configuration get some defaults values, in order to perform the diffing against
 * the local configuration such fields need to be cleaned up if they don't appear in locally
 * (for example if field `x` defaults to `true` remotely, but locally it is not set then we do want to
 * remove it from the remote object so that it won't look like the value is being removed from the local one).
 *
 * This function performs such cleanup on a specific field.
 *
 * @param field The target field
 * @param localObj The local object (this can be the local raw config or a nested object of it)
 * @param remoteObj The remote object (this can be the remote config or a nested object of it)
 * @param remoteDefaultValue The remote default value that the field gets.
 */
function cleanupRemoteDefault({
	field,
	localObj,
	remoteObj,
	remoteDefaultValue,
}: {
	field: string;
	localObj: Record<string, unknown>;
	remoteObj: Record<string, unknown>;
	remoteDefaultValue: unknown;
}) {
	if (deepStrictEqual(remoteObj[field], remoteDefaultValue)) {
		if (!(field in localObj)) {
			delete remoteObj[field];
		}

		if (localObj[field] === undefined) {
			remoteObj[field] = undefined;
		}
	}
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

function deepStrictEqual(source: unknown, target: unknown): boolean {
	try {
		assert.deepStrictEqual(source, target);
		return true;
	} catch {
		return false;
	}
}
