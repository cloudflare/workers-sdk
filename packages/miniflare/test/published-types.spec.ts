import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import ts from "typescript";
import { afterAll, beforeAll, describe, it } from "vitest";

// Regression tests for https://github.com/cloudflare/workers-sdk/issues/16982:
// the published declaration entrypoint imports `@cloudflare/workers-types`,
// which miniflare only lists under `devDependencies`. Installing miniflare
// never installs its dev dependencies, so consumers who type check
// miniflare's declarations (`skipLibCheck: false`) get TS2307 errors.

const PKG_ROOT = path.resolve(__dirname, "..");
const DTS_ENTRYPOINT = path.join(PKG_ROOT, "dist", "src", "index.d.ts");
const WORKERS_TYPES = "@cloudflare/workers-types";

interface PackageJson {
	types: string;
	dependencies?: Record<string, string>;
	peerDependencies?: Record<string, string>;
}

function readPackageJson(): PackageJson {
	return JSON.parse(
		fs.readFileSync(path.join(PKG_ROOT, "package.json"), "utf8")
	) as PackageJson;
}

/** Packages an installer makes resolvable from inside miniflare. */
function installablePackages(pkg: PackageJson): string[] {
	return [
		...Object.keys(pkg.dependencies ?? {}),
		...Object.keys(pkg.peerDependencies ?? {}),
	];
}

describe("published declarations", () => {
	let consumerDir: string;

	beforeAll(() => {
		if (!fs.existsSync(DTS_ENTRYPOINT)) {
			throw new Error(
				`Expected built declarations at ${DTS_ENTRYPOINT}; run \`pnpm build\` first`
			);
		}

		// Lay out a consumer project the way a strict (non-hoisting) installer
		// such as pnpm does: the consumer can see only `miniflare`, and
		// `miniflare` can see only the packages its `package.json` declares as
		// dependencies or peer dependencies, never its dev dependencies.
		consumerDir = fs.mkdtempSync(
			path.join(os.tmpdir(), "miniflare-published-types-")
		);
		const pkg = readPackageJson();
		const installed = path.join(consumerDir, "node_modules", "miniflare");
		fs.mkdirSync(path.dirname(path.join(installed, pkg.types)), {
			recursive: true,
		});
		fs.copyFileSync(
			path.join(PKG_ROOT, "package.json"),
			path.join(installed, "package.json")
		);
		fs.copyFileSync(DTS_ENTRYPOINT, path.join(installed, pkg.types));
		for (const name of installablePackages(pkg)) {
			const source = path.join(PKG_ROOT, "node_modules", name);
			if (!fs.existsSync(source)) {
				// e.g. an optional peer dependency that isn't installed here
				continue;
			}
			const target = path.join(installed, "node_modules", name);
			fs.mkdirSync(path.dirname(target), { recursive: true });
			fs.symlinkSync(fs.realpathSync(source), target, "junction");
		}

		fs.writeFileSync(
			path.join(consumerDir, "package.json"),
			JSON.stringify({ name: "consumer", private: true, type: "module" })
		);
		fs.writeFileSync(
			path.join(consumerDir, "index.ts"),
			[
				'import type { MiniflareOptions } from "miniflare";',
				"export type Options = MiniflareOptions;",
				"",
			].join("\n")
		);
	});

	afterAll(() => {
		if (consumerDir !== undefined) {
			fs.rmSync(consumerDir, { recursive: true, force: true });
		}
	});

	it("declares @cloudflare/workers-types, which its declarations import, as a dependency or peer dependency", ({
		expect,
	}) => {
		const declarations = fs.readFileSync(DTS_ENTRYPOINT, "utf8");
		expect(declarations).toMatch(
			/from ['"]@cloudflare\/workers-types(\/experimental)?['"]/
		);
		expect(installablePackages(readPackageJson())).toContain(WORKERS_TYPES);
	});

	it("resolves @cloudflare/workers-types when a consumer type checks the declarations with only miniflare installed", ({
		expect,
	}) => {
		const program = ts.createProgram({
			rootNames: [path.join(consumerDir, "index.ts")],
			options: {
				strict: true,
				noEmit: true,
				skipLibCheck: false,
				target: ts.ScriptTarget.ES2022,
				module: ts.ModuleKind.NodeNext,
				moduleResolution: ts.ModuleResolutionKind.NodeNext,
				types: [],
			},
		});
		const unresolved = ts
			.getPreEmitDiagnostics(program)
			.filter((diagnostic) => diagnostic.code === 2307)
			.map((diagnostic) =>
				ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")
			)
			.filter((message) => message.includes(`'${WORKERS_TYPES}`));

		expect(unresolved).toEqual([]);
	});
});
