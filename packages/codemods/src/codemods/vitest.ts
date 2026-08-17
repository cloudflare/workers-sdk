import { transformFiles } from "../files";
import transformV3ToV4 from "./vitest-v3-to-v4";
import type { Codemod } from "../types";

const OLD_PACKAGE = "@cloudflare/vitest-pool-workers";
const NEW_PACKAGE = "@cloudflare/vitest-plugin";
const V1_RANGE = "^1.0.0";
const SOURCE_PATTERNS = ["**/*.{js,cjs,mjs,jsx,ts,cts,mts,tsx,json,jsonc}"];
const PRESERVED_PROTOCOLS = /^(?:workspace|catalog|link|file|npm):/;

function getV1Specifier(specifier: string): string {
	return PRESERVED_PROTOCOLS.test(specifier) ? specifier : V1_RANGE;
}

function renamePackageDependency(source: string): string {
	let packageJson: {
		dependencies?: Record<string, string>;
		devDependencies?: Record<string, string>;
		peerDependencies?: Record<string, string>;
		optionalDependencies?: Record<string, string>;
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
