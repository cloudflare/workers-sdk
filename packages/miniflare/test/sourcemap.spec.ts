import fs from "node:fs";
import path from "node:path";
import { describe, it } from "vitest";

const DIST_PATH = path.resolve(__dirname, "..", "dist", "src");

describe("sourcemap", () => {
	const mapPath = path.join(DIST_PATH, "index.js.map");
	const map = JSON.parse(fs.readFileSync(mapPath, "utf8"));

	it("should include sourcesContent in the main bundle sourcemap", ({
		expect,
	}) => {
		expect(map.sourcesContent).toBeDefined();
		expect(Array.isArray(map.sourcesContent)).toBe(true);
		expect(map.sourcesContent).toHaveLength(map.sources.length);
	});

	it("should have non-null sourcesContent for every source entry", ({
		expect,
	}) => {
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
