import * as path from "node:path";
import { describe, it } from "vitest";
import {
	getBasePath,
	getWranglerHiddenDirPath,
	readableRelative,
} from "../paths";

describe("paths", () => {
	describe("getBasePath()", () => {
		it("should return the path to the wrangler package", ({ expect }) => {
			expect(getBasePath()).toMatch(/packages[/\\]wrangler$/);
		});

		it("should use the __RELATIVE_PACKAGE_PATH__ as defined on the global context to compute the base path", ({
			expect,
		}) => {
			(
				global as unknown as { __RELATIVE_PACKAGE_PATH__: string }
			).__RELATIVE_PACKAGE_PATH__ = "/foo/bar";
			expect(getBasePath()).toEqual(path.resolve("/foo/bar"));
		});
	});

	describe("getWranglerHiddenDirPath()", () => {
		it("should return .wrangler path in project root", ({ expect }) => {
			expect(getWranglerHiddenDirPath("/project")).toBe(
				path.join("/project", ".wrangler")
			);
		});

		it("should use current working directory when projectRoot is undefined", ({
			expect,
		}) => {
			expect(getWranglerHiddenDirPath(undefined)).toBe(
				path.join(process.cwd(), ".wrangler")
			);
		});
	});
});

describe("readableRelative", () => {
	const base = process.cwd();

	it("should leave paths to files in the current directory as-is", ({
		expect,
	}) => {
		expect(readableRelative(path.join(base, "wrangler.toml"))).toBe(
			`wrangler.toml`
		);
	});

	it("should leave files in the parent directory as-is", ({ expect }) => {
		expect(readableRelative(path.resolve(base, "../wrangler.toml"))).toMatch(
			/^\..[/\\]wrangler.toml$/
		);
	});

	it("should add ./ to nested paths", ({ expect }) => {
		expect(
			readableRelative(path.join(base, "subdir", "wrangler.toml"))
		).toMatch(/^\.[/\\]subdir[/\\]wrangler\.toml$/);
	});
});
