import * as fs from "node:fs";
import { isBuiltin } from "node:module";
import * as path from "node:path";
import * as esbuild from "esbuild";
import { describe, it } from "vitest";

const WRANGLER_DIR = path.resolve(import.meta.dirname, "../..");
const WRANGLER_DIST_DIR = path.join(WRANGLER_DIR, "wrangler-dist");

interface PackageJson {
	name: string;
	dependencies?: Record<string, string>;
	devDependencies?: Record<string, string>;
	peerDependencies?: Record<string, string>;
	optionalDependencies?: Record<string, string>;
}

/**
 * Extracts every module specifier imported by a TypeScript declaration file,
 * including `import ... from`, `import("...")`, and `export ... from` forms,
 * while ignoring specifiers that only appear inside comments or doc examples.
 *
 * Uses esbuild's parser (parsing the file as TypeScript with every module
 * marked external) so string literals that merely look like imports are not
 * reported.
 */
async function extractImportedSpecifiers(
	content: string
): Promise<Set<string>> {
	const result = await esbuild.build({
		stdin: { contents: content, loader: "ts" },
		metafile: true,
		bundle: true,
		write: false,
		logLevel: "silent",
		platform: "neutral",
		plugins: [
			{
				name: "externalize-all",
				setup(build) {
					build.onResolve({ filter: /.*/ }, (args) => {
						if (args.kind === "entry-point") {
							return undefined;
						}
						return { path: args.path, external: true };
					});
				},
			},
		],
	});

	const specifiers = new Set<string>();
	for (const input of Object.values(result.metafile.inputs)) {
		for (const imported of input.imports) {
			specifiers.add(imported.path);
		}
	}
	return specifiers;
}

/** Returns whether the specifier is a bare import of an npm package. */
function isBarePackageSpecifier(specifier: string): boolean {
	if (!specifier || specifier.startsWith(".") || specifier.startsWith("/")) {
		return false;
	}
	if (isBuiltin(specifier)) {
		return false;
	}
	// Virtual modules and other protocols (e.g. `cloudflare:workers`), as
	// opposed to scoped packages, which always start with `@`.
	if (/^[a-z][a-z0-9+.-]*:/.test(specifier) && !specifier.startsWith("@")) {
		return false;
	}
	const packageNameRe =
		/^(?:@[a-z0-9._~-]+\/)?[a-z0-9][a-z0-9._~-]*(?:\/[a-z0-9._~-]+)*$/;
	return packageNameRe.test(specifier);
}

/** Reduces a specifier to the name of the package it imports from. */
function packageNameOf(specifier: string): string {
	if (specifier.startsWith("@")) {
		return specifier.split("/").slice(0, 2).join("/");
	}
	return specifier.split("/")[0] ?? specifier;
}

describe("published type declarations", () => {
	it("imports only packages wrangler declares as dependencies or peer dependencies", async ({
		expect,
	}) => {
		const cliDtsPath = path.join(WRANGLER_DIST_DIR, "cli.d.ts");
		expect(
			fs.existsSync(cliDtsPath),
			`wrangler's "types" entry (${cliDtsPath}) is missing; run \`pnpm build\` in packages/wrangler first`
		).toBe(true);

		const packageJson = JSON.parse(
			fs.readFileSync(path.join(WRANGLER_DIR, "package.json"), "utf-8")
		) as PackageJson;

		const declaredPackages = new Set([
			...Object.keys(packageJson.dependencies ?? {}),
			...Object.keys(packageJson.peerDependencies ?? {}),
			...Object.keys(packageJson.optionalDependencies ?? {}),
		]);

		const content = fs.readFileSync(cliDtsPath, "utf-8");
		const specifiers = await extractImportedSpecifiers(content);

		const undeclared = [
			...new Set(
				[...specifiers]
					.filter((specifier) => isBarePackageSpecifier(specifier))
					.map(packageNameOf)
			),
		].filter((packageName) => !declaredPackages.has(packageName));

		expect(undeclared).toEqual([]);
	});
});
