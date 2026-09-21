import { cp, mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { removeDir } from "@cloudflare/workers-utils";
import { resolvePathSync } from "mlly";
import { build } from "vite";
import { test } from "vitest";

test("preserves polyfill side effects when bundled from the published package", async ({
	expect,
}) => {
	const root = await mkdtemp(join(tmpdir(), "unenv-preset-side-effects-"));

	try {
		const packageRoot = dirname(
			resolvePathSync("@cloudflare/unenv-preset/package.json", {
				url: import.meta.url,
			})
		);
		const installedPackage = join(
			root,
			"node_modules",
			"@cloudflare",
			"unenv-preset"
		);
		await mkdir(installedPackage, { recursive: true });
		await cp(
			join(packageRoot, "package.json"),
			join(installedPackage, "package.json")
		);
		await cp(join(packageRoot, "dist"), join(installedPackage, "dist"), {
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
	} finally {
		await removeDir(root);
	}
});
