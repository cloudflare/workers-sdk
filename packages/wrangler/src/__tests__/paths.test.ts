import path from "node:path";
import { readableRelative } from "../paths";

describe("readableRelative", () => {
	const base = process.cwd();

	it("should leave files in the current directory as-is", () => {
		expect(readableRelative(path.join(base, "wrangler.toml"))).toBe(
			`wrangler.toml`
		);
	});

	it("should leave files in the parent directory as-is", () => {
		expect(readableRelative(path.resolve(base, "../wrangler.toml"))).toMatch(
			/^\..[/\\]wrangler.toml$/
		);
	});

	it("should add ./ to nested paths", () => {
		expect(
			readableRelative(path.join(base, "subdir", "wrangler.toml"))
		).toMatch(/^\.[/\\]subdir[/\\]wrangler\.toml$/);
	});
});
