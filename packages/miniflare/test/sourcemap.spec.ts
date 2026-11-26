import fs from "node:fs";
import path from "node:path";
import { describe, it } from "vitest";

const DIST_PATH = path.resolve(__dirname, "..", "dist", "src");
const sourcemaps = process.env.SOURCEMAPS !== "false";

describe.skipIf(!sourcemaps)("sourcemap", () => {
	const mapPath = path.join(DIST_PATH, "index.js.map");

	it("should include sourcesContent in the main bundle sourcemap", ({
		expect,
	}) => {
		const map = JSON.parse(fs.readFileSync(mapPath, "utf8"));
		expect(map.sourcesContent).toBeDefined();
		expect(Array.isArray(map.sourcesContent)).toBe(true);
		expect(map.sourcesContent).toHaveLength(map.sources.length);
	});

	it("should have non-null sourcesContent for every source entry", ({
		expect,
	}) => {
		const map = JSON.parse(fs.readFileSync(mapPath, "utf8"));
		// Every source must have a non-null sourcesContent entry so the
		// sourcemap is fully self-contained. This prevents warnings from
		// tools like Vite/Vitest that validate sourcemaps at runtime.
		// See https://github.com/cloudflare/workers-sdk/issues/13555
		const nullEntries = map.sources.filter(
			(_: string, i: number) => map.sourcesContent[i] == null
		);
		expect(nullEntries).toEqual([]);
	});
});

it.skipIf(sourcemaps)(
	"omits package source maps from release builds",
	({ expect }) => {
		const files = fs.readdirSync(DIST_PATH, {
			recursive: true,
			encoding: "utf8",
		});
		expect(files.filter((file) => file.endsWith(".map"))).toEqual([]);
		expect(files.some((file) => file.endsWith(".js"))).toBe(true);
		for (const file of files.filter((file) => file.endsWith(".js"))) {
			expect(fs.readFileSync(path.join(DIST_PATH, file), "utf8")).not.toMatch(
				/^\/\/# sourceMappingURL=/m
			);
		}
	}
);
