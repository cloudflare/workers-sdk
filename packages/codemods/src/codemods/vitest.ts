import { transformFiles } from "../files";
import transformV3ToV4 from "./vitest-v3-to-v4";
import type { Codemod } from "../types";

const OLD_PACKAGE = "@cloudflare/vitest-pool-workers";
const NEW_PACKAGE = "@cloudflare/vitest-plugin";
const V1_RANGE = "^1.0.0";
const SOURCE_PATTERNS = ["**/*.{js,cjs,mjs,jsx,ts,cts,mts,tsx,json,jsonc}"];
const PRESERVED_PROTOCOLS = /^(?:(?:workspace|catalog|link|file|npm):|\$)/;

/** Returns the v1 range while preserving package-manager protocol references. */
function getV1Specifier(specifier: string): string {
	return PRESERVED_PROTOCOLS.test(specifier) ? specifier : V1_RANGE;
}

/** Renames a package selector and updates any plain version range it contains. */
function renamePackageSelector(selector: string): string {
	const packageIndex = selector.indexOf(OLD_PACKAGE);
	if (packageIndex === -1) {
		return selector;
	}
	const versionIndex = packageIndex + OLD_PACKAGE.length;
	return selector[versionIndex] === "@"
		? `${selector.slice(0, packageIndex)}${NEW_PACKAGE}@${getV1Specifier(selector.slice(versionIndex + 1))}`
		: selector.replaceAll(OLD_PACKAGE, NEW_PACKAGE);
}

/**
 * Recursively migrates package selectors and ranges in an override-style map.
 *
 * @returns Whether the map was changed.
 */
function renameVersionMap(value: unknown): boolean {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return false;
	}

	const entries = Object.entries(value);
	let changed = false;
	for (const [key, entryValue] of entries) {
		const renamedKey = renamePackageSelector(key);
		if (
			renamedKey !== key &&
			entryValue &&
			typeof entryValue === "object" &&
			!Array.isArray(entryValue) &&
			typeof (entryValue as Record<string, unknown>)["."] === "string"
		) {
			(entryValue as Record<string, string>)["."] = getV1Specifier(
				(entryValue as Record<string, string>)["."]
			);
			changed = true;
		}
		const renamedValue =
			renamedKey !== key && typeof entryValue === "string"
				? getV1Specifier(entryValue)
				: entryValue;
		changed = renameVersionMap(renamedValue) || changed;
		if (renamedKey !== key || renamedValue !== entryValue) {
			delete (value as Record<string, unknown>)[key];
			(value as Record<string, unknown>)[renamedKey] = renamedValue;
			changed = true;
		}
	}
	return changed;
}

/** Renames the Vitest package and updates version-bearing package.json fields. */
function renamePackageDependency(source: string): string {
	let packageJson: {
		dependencies?: Record<string, string>;
		devDependencies?: Record<string, string>;
		peerDependencies?: Record<string, string>;
		optionalDependencies?: Record<string, string>;
		overrides?: Record<string, unknown>;
		resolutions?: Record<string, unknown>;
		pnpm?: {
			overrides?: Record<string, unknown>;
			packageExtensions?: Record<string, unknown>;
		};
	};
	try {
		packageJson = JSON.parse(source) as typeof packageJson;
	} catch {
		return source.replaceAll(OLD_PACKAGE, NEW_PACKAGE);
	}

	const dependencyGroups = [
		packageJson.dependencies,
		packageJson.devDependencies,
		packageJson.peerDependencies,
		packageJson.optionalDependencies,
	];
	const hasOldDeclaration = dependencyGroups.some(
		(dependencies) => dependencies && OLD_PACKAGE in dependencies
	);
	const hasNewDeclaration = dependencyGroups.some(
		(dependencies) => dependencies && NEW_PACKAGE in dependencies
	);
	if (hasOldDeclaration && hasNewDeclaration) {
		throw new Error(
			`Cannot migrate a package.json with conflicting ${OLD_PACKAGE} and ${NEW_PACKAGE} dependency declarations`
		);
	}

	let changed = false;
	for (const dependencies of dependencyGroups) {
		if (!dependencies || !(OLD_PACKAGE in dependencies)) {
			continue;
		}

		const entries = Object.entries(dependencies).map(([name, version]) =>
			name === OLD_PACKAGE
				? [NEW_PACKAGE, getV1Specifier(version)]
				: [name, version]
		);
		for (const key of Object.keys(dependencies)) {
			delete dependencies[key];
		}
		Object.assign(dependencies, Object.fromEntries(entries));
		changed = true;
	}
	for (const versionMap of [
		packageJson.overrides,
		packageJson.resolutions,
		packageJson.pnpm?.overrides,
		packageJson.pnpm?.packageExtensions,
	]) {
		changed = renameVersionMap(versionMap) || changed;
	}

	if (!changed) {
		return source.replaceAll(OLD_PACKAGE, NEW_PACKAGE);
	}

	const indent = source.match(/\n([\t ]+)"/)?.[1] ?? "\t";
	const trailingNewline = source.endsWith("\n") ? "\n" : "";
	// Re-serialise the rewritten dependency ranges, then sweep any remaining
	// textual references (scripts, `pnpm.overrides`, `resolutions`, custom config
	// keys) so nothing is left pointing at the removed package.
	return (
		JSON.stringify(packageJson, null, indent).replaceAll(
			OLD_PACKAGE,
			NEW_PACKAGE
		) + trailingNewline
	);
}

export const vitestCodemods: Codemod[] = [
	{
		name: "vitest:v3-to-v4",
		aliases: ["vitest v3 to v4"],
		description: "Migrate Workers Vitest configuration from Vitest v3 to v4",
		async run(context) {
			const changedFiles = await transformFiles(
				context,
				["**/vitest.config.{js,cjs,mjs,ts,cts,mts}"],
				(source) => transformV3ToV4(source)
			);
			return { changedFiles };
		},
	},
	{
		name: "vitest:pool-workers-to-vitest-plugin",
		aliases: ["vitest pool workers to vitest plugin", "vitest v1"],
		description: `Rename ${OLD_PACKAGE} to ${NEW_PACKAGE} v1`,
		async run(context) {
			const changedFiles = await transformFiles(
				context,
				SOURCE_PATTERNS,
				(source, filePath) =>
					filePath.endsWith("package.json")
						? renamePackageDependency(source)
						: source.replaceAll(OLD_PACKAGE, NEW_PACKAGE)
			);
			return { changedFiles };
		},
	},
];
