import jscodeshift from "jscodeshift";
import { transformFiles } from "../files";
import transformV3ToV4 from "./vitest-v3-to-v4";
import type { Codemod } from "../types";

const OLD_PACKAGE = "@cloudflare/vitest-pool-workers";
const NEW_PACKAGE = "@cloudflare/vitest-plugin";
const V1_RANGE = "^1.0.0";
const SOURCE_PATTERNS = ["**/*.{js,cjs,mjs,jsx,ts,cts,mts,tsx,json,jsonc}"];

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
	const oldDeclarations = dependencyGroups.filter(
		(dependencies) => dependencies && OLD_PACKAGE in dependencies
	);
	const hasNewDeclaration = dependencyGroups.some(
		(dependencies) => dependencies && NEW_PACKAGE in dependencies
	);
	if (
		oldDeclarations.length > 1 ||
		(oldDeclarations.length === 1 && hasNewDeclaration)
	) {
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
			name === OLD_PACKAGE ? [NEW_PACKAGE, V1_RANGE] : [name, version]
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
	return JSON.stringify(packageJson, null, indent) + trailingNewline;
}

export const vitestCodemods: Codemod[] = [
	{
		category: "vitest",
		name: "vitest-v3-to-v4",
		aliases: ["vitest v3 to v4"],
		description: "Migrate Workers Vitest configuration from Vitest v3 to v4",
		async run(context) {
			const changedFiles = await transformFiles(
				context,
				["**/vitest.config.{js,cjs,mjs,ts,cts,mts}"],
				(source, filePath) =>
					transformV3ToV4(
						{ path: filePath, source },
						{ jscodeshift: jscodeshift.withParser("ts") as never }
					)
			);
			return { changedFiles };
		},
	},
	{
		category: "vitest",
		name: "vitest-pool-workers-to-vitest-plugin",
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
