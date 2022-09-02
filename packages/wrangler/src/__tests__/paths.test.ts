import * as path from "node:path";
import { getBasePath } from "../paths";

describe("paths", () => {
	describe("getBasePath()", () => {
		it("should return the path to the wrangler package", () => {
			expect(getBasePath()).toMatch(/packages[/\\]wrangler$/);
		});

		it("should use the __RELATIVE_PACKAGE_PATH__ as defined on the global context to compute the base path", () => {
			(
				global as unknown as { __RELATIVE_PACKAGE_PATH__: string }
			).__RELATIVE_PACKAGE_PATH__ = "/foo/bar";
			expect(getBasePath()).toEqual(path.resolve("/foo/bar"));
		});
	});
});
