import { cp, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "vite";
import { afterEach, test } from "vitest";

const temporaryDirectories: string[] = [];

afterEach(async () => {
	await Promise.all(
		temporaryDirectories.splice(0).map((directory) =>
			rm(directory, {
				force: true,
				recursive: true,
			})
		)
	);
});

test("preserves polyfill side effects when bundled from the published package", async ({
	expect,
}) => {
	const root = await mkdtemp(join(tmpdir(), "unenv-preset-side-effects-"));
	temporaryDirectories.push(root);

	const packageRoot = new URL("../", import.meta.url);
	const installedPackage = join(
		root,
		"node_modules",
		"@cloudflare",
		"unenv-preset"
	);
	await mkdir(installedPackage, { recursive: true });
	await cp(
		new URL("package.json", packageRoot),
		join(installedPackage, "package.json")
	);
	await cp(new URL("dist", packageRoot), join(installedPackage, "dist"), {
		recursive: true,
	});
	await writeFile(
		join(root, "index.js"),
		'import "@cloudflare/unenv-preset/polyfill/performance";\n'
	);

	const result = await build({
		configFile: false,
		logLevel: "silent",
		root,
		build: {
			rollupOptions: {
				external: /^node:/,
				input: join(root, "index.js"),
			},
			write: false,
		},
	});
	const outputs = Array.isArray(result) ? result : [result];
	const code = outputs
		.flatMap((output) => ("output" in output ? output.output : []))
		.filter((output) => output.type === "chunk")
		.map((output) => output.code)
		.join("\n");

	expect(code).toContain("globalThis.Performance=");
});
