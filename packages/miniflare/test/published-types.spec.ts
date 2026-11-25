import {
	cpSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { expect, test } from "vitest";

const packageRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));

interface PackageManifest {
	dependencies?: Record<string, string>;
	optionalDependencies?: Record<string, string>;
	peerDependencies?: Record<string, string>;
	peerDependenciesMeta?: Record<string, { optional?: boolean }>;
}

/**
 * Lists the packages an installer would put in a consumer's `node_modules`:
 * regular and optional dependencies, plus any peer dependency that is not
 * marked optional.
 */
function installedPackages(manifest: PackageManifest): Set<string> {
	return new Set([
		...Object.keys(manifest.dependencies ?? {}),
		...Object.keys(manifest.optionalDependencies ?? {}),
		...Object.keys(manifest.peerDependencies ?? {}).filter(
			(name) => !manifest.peerDependenciesMeta?.[name]?.optional
		),
	]);
}

test("published declarations resolve @cloudflare/workers-types in a strict consumer", () => {
	const consumerRoot = mkdtempSync(path.join(tmpdir(), "miniflare-types-"));

	try {
		const manifest = JSON.parse(
			readFileSync(path.join(packageRoot, "package.json"), "utf8")
		) as PackageManifest;
		const miniflareRoot = path.join(consumerRoot, "node_modules", "miniflare");
		mkdirSync(path.join(miniflareRoot, "dist", "src"), { recursive: true });
		cpSync(
			path.join(packageRoot, "package.json"),
			path.join(miniflareRoot, "package.json")
		);
		cpSync(
			path.join(packageRoot, "dist", "src", "index.d.ts"),
			path.join(miniflareRoot, "dist", "src", "index.d.ts")
		);

		// Mirror an install of the published package: link only what the manifest
		// declares, never the workspace's devDependencies. `@types/node` is linked
		// because the consumer compiles with Node's types.
		for (const name of [...installedPackages(manifest), "@types/node"]) {
			const destination = path.join(consumerRoot, "node_modules", name);
			mkdirSync(path.dirname(destination), { recursive: true });
			symlinkSync(
				path.join(packageRoot, "node_modules", name),
				destination,
				"junction"
			);
		}

		writeFileSync(
			path.join(consumerRoot, "package.json"),
			JSON.stringify({ type: "module" })
		);
		const consumer = path.join(consumerRoot, "consumer.ts");
		writeFileSync(
			consumer,
			`import type { MiniflareOptions } from "miniflare";

const options: MiniflareOptions = {};
void options;
`
		);

		const program = ts.createProgram({
			rootNames: [consumer],
			options: {
				module: ts.ModuleKind.NodeNext,
				target: ts.ScriptTarget.ES2022,
				strict: true,
				skipLibCheck: false,
				noEmit: true,
				types: ["node"],
			},
		});
		const diagnostics = ts
			.getPreEmitDiagnostics(program)
			.filter((diagnostic) =>
				ts
					.flattenDiagnosticMessageText(diagnostic.messageText, "\n")
					.includes("@cloudflare/workers-types")
			);

		expect(
			ts.formatDiagnostics(diagnostics, {
				getCanonicalFileName: (fileName) => fileName,
				getCurrentDirectory: () => consumerRoot,
				getNewLine: () => "\n",
			})
		).toBe("");
	} finally {
		rmSync(consumerRoot, { recursive: true, force: true, maxRetries: 3 });
	}
});
