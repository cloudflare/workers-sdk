import { Diff } from "../cloudchamber/helpers/diff";
import type { Config, RawConfig } from "../config";

function orderObjectFields<T extends Record<string, unknown>>(
	object: T,
	target: Record<string, unknown>
): T {
	const targetKeysIndexesMap = Object.fromEntries(
		Object.keys(target).map((key, i) => [key, i])
	);

	const orderedObject = Object.fromEntries(
		Object.entries(object).sort(([keyA], [keyB]) => {
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

	for (const [key, value] of Object.entries(orderedObject)) {
		if (
			typeof value === "object" &&
			value !== null &&
			!Array.isArray(value) &&
			typeof target[key] === "object" &&
			target[key] !== null &&
			!Array.isArray(target[key])
		) {
			(orderedObject as Record<string, unknown>)[key] = orderObjectFields(
				value as Record<string, unknown>,
				target[key] as Record<string, unknown>
			);
		}
	}

	return orderedObject;
}

function normalizeRemoteConfigAsLocal(
	remoteConfig: RawConfig,
	localConfig: RawConfig
): RawConfig {
	const normalizedRemoteConfig: RawConfig = orderObjectFields(
		remoteConfig as Record<string, unknown>,
		localConfig as Record<string, unknown>
	);

	return normalizedRemoteConfig;
}

function normalizeLocalConfigAsRemote(
	rawConfig: RawConfig,
	resolvedConfig: Config
): RawConfig {
	const normalizedConfig: RawConfig = {};

	for (const entry of Object.entries(rawConfig)) {
		const key = entry[0] as keyof RawConfig;
		const value = entry[1];

		if (localOnlyConfigKeys.has(key)) {
			// If the key is only meaningful locally then we can skip it here
			continue;
		}

		normalizedConfig[key as keyof RawConfig] = value;

		if (key === "main") {
			// For the main field we want to consider the normalized/resolved value
			normalizedConfig.main = resolvedConfig.main;
			continue;
		}
	}

	if (normalizedConfig.observability === undefined) {
		normalizedConfig.observability = {
			enabled: true,
			head_sampling_rate: 1,
		};
	}

	// The remote config defaults `head_sampling_rate` to `1`
	// while wrangler defaults it to `undefined`
	// if (normalizedConfig.observability.head_sampling_rate === undefined) {
	// 	normalizedConfig.observability.head_sampling_rate = 1;
	// }

	// if (
	// 	normalizedConfig.observability.logs &&
	// 	normalizedConfig.observability.logs.enabled === undefined
	// ) {
	// 	normalizedConfig.observability.logs.enabled = true;
	// }

	if (normalizedConfig.workers_dev === undefined) {
		// The remote config defaults `workers_dev` to `true`
		// while wrangler defaults it to `undefined`
		normalizedConfig.workers_dev = true;
	}

	return normalizedConfig;
}

/**
 * Set of config keys that only exist locally (i.e. there is no remote representation for them)
 */
// TODO: add test that shows that these do get ignored
// TODO: refine this set
const localOnlyConfigKeys = new Set([
	"$schema",
	"configPath",
	"userConfigPath",
	"topLevelName",
	"pages_build_output_dir",
	"legacy_env",
	"send_metrics",
	"keep_vars",
	"jsx_factory",
	"jsx_fragment",
	"tsconfig",
	"rules",
	"find_additional_modules",
	"preserve_file_names",
	"base_dir",
	"assets",
	"limits",
	"build",
	"define",
	"migrations",
	"unsafe_hello_world",
	"version_metadata",
	"logfwdr",
	"no_bundle",
	"minify",
	"keep_names",
	"first_party_worker",
	"upload_source_maps",
	"dev",
	"alias",
	"wasm_modules",
	"text_blobs",
	"data_blobs",
	"account_id",
]);

export function getRemoteConfigDiff(
	remoteConfig: RawConfig,
	localConfig: RawConfig,
	localResolvedConfig: Config
): {
	diff: Diff;
	onlyAdditionsIfAny: boolean;
} {
	const normalizedLocal = normalizeLocalConfigAsRemote(
		localConfig,
		localResolvedConfig
	);
	const normalizedRemote = normalizeRemoteConfigAsLocal(
		remoteConfig,
		normalizedLocal
	);

	const diff = new Diff(
		JSON.stringify(normalizedRemote, null, 2),
		JSON.stringify(normalizedLocal, null, 2)
	);

	return {
		diff,
		onlyAdditionsIfAny: getOnlyAdditionsIfAny(diff),
	};
}

function getOnlyAdditionsIfAny(diff: Diff): boolean {
	const diffLines = `${diff}`.split("\n");
	let currentRemovalIdx = 0;
	while (currentRemovalIdx !== -1) {
		const nextRemovalIdx = diffLines.findIndex(
			(line, idx) => idx >= currentRemovalIdx && /^\s*-/.test(line)
		);
		if (nextRemovalIdx === -1) {
			// We've looked for all the removals none were actually modifications
			// so we return true, at most the changes in the diff are additions
			return true;
		}
		currentRemovalIdx = nextRemovalIdx;
		const lineAtIdx = diffLines[currentRemovalIdx];
		const nextLine = diffLines[currentRemovalIdx + 1] ?? "";
		const lineAtIdxButAdditionAndWithComma = `${lineAtIdx.replace(/^(\s*)-/, "$1+")},`;
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
