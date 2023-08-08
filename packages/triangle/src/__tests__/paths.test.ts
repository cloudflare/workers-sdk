import * as path from "node:path";
import { getBasePath, readableRelative } from "../paths";

describe("paths", () => {
	describe("getBasePath()", () => {
		it("should return the path to the triangle package", () => {
			expect(getBasePath()).toMatch(/packages[/\\]triangle$/);
		});

		it("should use the __RELATIVE_PACKAGE_PATH__ as defined on the global context to compute the base path", () => {
			(
				global as unknown as { __RELATIVE_PACKAGE_PATH__: string }
			).__RELATIVE_PACKAGE_PATH__ = "/foo/bar";
			expect(getBasePath()).toEqual(path.resolve("/foo/bar"));
		});
	});
});

describe("readableRelative", () => {
	const base = process.cwd();

	it("should leave paths to files in the current directory as-is", () => {
		expect(readableRelative(path.join(base, "triangle.toml"))).toBe(
			`triangle.toml`
		);
	});

	it("should leave files in the parent directory as-is", () => {
		expect(readableRelative(path.resolve(base, "../triangle.toml"))).toMatch(
			/^\..[/\\]triangle.toml$/
		);
	});

	it("should add ./ to nested paths", () => {
		expect(
			readableRelative(path.join(base, "subdir", "triangle.toml"))
		).toMatch(/^\.[/\\]subdir[/\\]triangle\.toml$/);
	});
});
