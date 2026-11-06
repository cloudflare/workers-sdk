import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { isBuiltin } from "node:module";
import { test } from "vitest";

const pkgRoot = path.resolve(__dirname, "..");
const entrypoint = path.join(pkgRoot, "dist", "src", "index.d.ts");
const shippedRoot = path.join(pkgRoot, "dist", "src");

/**
 * Collects every module specifier imported or re-exported by a declaration file.
 * @param contents The `.d.ts` file's text.
 * @returns The module specifiers referenced by `import`/`export ... from` clauses.
 */
function collectModuleSpecifiers(contents: string): string[] {
	const specifiers: string[] = [];
	// Matches `... from '<specifier>';` clauses (import and export-from).
	const fromClause = /from\s+['"]([^'"]+)['"]/g;
	// Matches bare side-effect imports: `import '<specifier>';`.
	const sideEffectImport = /^\s*import\s+['"]([^'"]+)['"]/gm;
	for (const match of contents.matchAll(fromClause)) {
		specifiers.push(match[1]!);
	}
	for (const match of contents.matchAll(sideEffectImport)) {
		specifiers.push(match[1]!);
	}
	return specifiers;
}

/**
 * Resolves a relative module specifier the way a consumer's TypeScript compiler
 * would when resolving types from inside the published package: as a file with
 * `.d.ts` appended, then as a file directly, then as a directory with an
 * `index.d.ts`, and finally as a directory whose `package.json` points at a
 * types entry.
 *
 * @param specifier The relative specifier, as written in the declaration file.
 * @param fromDirectory The directory containing the declaration file.
 * @returns The path of the declaration file the specifier resolves to, if any.
 */
function resolveRelativeDeclaration(
	specifier: string,
	fromDirectory: string
): string | undefined {
	const resolved = path.resolve(fromDirectory, specifier);
	const candidates = [
		`${resolved}.d.ts`,
		resolved,
		path.join(resolved, "index.d.ts"),
	];
	for (const candidate of candidates) {
		if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
			return candidate;
		}
	}
	const packageJsonPath = path.join(resolved, "package.json");
	if (fs.existsSync(packageJsonPath)) {
		const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
		const typesField = packageJson.types ?? packageJson.typings;
		if (typeof typesField === "string") {
			const typesPath = path.resolve(resolved, typesField);
			if (fs.existsSync(typesPath)) {
				return typesPath;
			}
		}
	}
	return undefined;
}

test("declaration entrypoint's relative imports resolve within the package", () => {
	assert.ok(
		fs.existsSync(entrypoint),
		`expected built declaration entrypoint at ${path.relative(
			process.cwd(),
			entrypoint
		)}; run \`pnpm build\` first`
	);
	const contents = fs.readFileSync(entrypoint, "utf8");
	const specifiers = collectModuleSpecifiers(contents);
	const relative = specifiers.filter((specifier) =>
	specifier.startsWith(".")
	);
	assert.ok(relative.length > 0, "expected entrypoint to be a bundled rollup");

	const unresolved = relative.filter(
		(specifier) =>
			resolveRelativeDeclaration(specifier, path.dirname(entrypoint)) ===
			undefined
	);
	assert.deepEqual(
		unresolved,
		[],
		`dist/src/index.d.ts references relative modules that are not shipped in the package, so consumers get "TS2307: Cannot find module" when checking the entrypoint with skipLibCheck disabled. Missing declarations for: ${unresolved
			.map((specifier) => `'${specifier}'`)
			.join(", ")} (searched under ${shippedRoot})`
	);
});

test("declaration entrypoint imports only declared dependencies", () => {
	assert.ok(
		fs.existsSync(entrypoint),
		`expected built declaration entrypoint at ${path.relative(
			process.cwd(),
			entrypoint
		)}; run \`pnpm build\` first`
	);
	const contents = fs.readFileSync(entrypoint, "utf8");
	const specifiers = collectModuleSpecifiers(contents);

	const dependencies: Record<string, string> =
		JSON.parse(fs.readFileSync(path.join(pkgRoot, "package.json"), "utf8"))
			.dependencies ?? {};

	const undeclared = [
		...new Set(
			specifiers.filter((specifier) => {
				if (specifier.startsWith(".") || specifier.startsWith("/")) {
					return false;
				}
				if (specifier.startsWith("node:") || isBuiltin(specifier)) {
					return false;
				}
				const parts = specifier.split("/");
				const packageName = specifier.startsWith("@")
					? parts.slice(0, 2).join("/")
					: parts[0]!;
				return !(packageName in dependencies);
			})
		),
	];

	assert.deepEqual(
		undeclared,
		[],
		`dist/src/index.d.ts references packages that are not declared as installable dependencies of miniflare, so consumers who install the published package cannot resolve their types ("TS2307: Cannot find module"). Undeclared imports: ${undeclared
			.map((specifier) => `'${specifier}'`)
			.join(", ")}`
	);
});
