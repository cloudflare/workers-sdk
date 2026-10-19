import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { it } from "vitest";

const distPath = fileURLToPath(new URL("../../dist/", import.meta.url));

it("respects the package source-map setting for all built entry points", ({
	expect,
}) => {
	const files = fs.readdirSync(distPath, { recursive: true, encoding: "utf8" });
	expect(files).toContain("index.mjs");
	expect(files).toContain("index.d.mts");
	expect(files).toContain("cf-vite.mjs");

	if (process.env.SOURCEMAPS !== "false") {
		expect(files).toContain("index.mjs.map");
		expect(files).toContain("index.d.mts.map");
		expect(files).toContain("cf-vite.mjs.map");
		return;
	}

	expect(files.filter((file) => file.endsWith(".map"))).toEqual([]);
	for (const filename of files.filter((file) =>
		/\.(?:m?js|d\.mts)$/.test(file)
	)) {
		expect(fs.readFileSync(path.join(distPath, filename), "utf8")).not.toMatch(
			/^\/\/# sourceMappingURL=/m
		);
	}
});
