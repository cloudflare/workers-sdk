import { execSync } from "child_process";
import { mkdtempSync, readFileSync, realpathSync } from "fs";
import { tmpdir } from "os";
import * as path from "path";
import { join } from "path";
import { describe, expect, it } from "vitest";

describe("Pages D1 shim", () => {
	it("builds functions with D1 binding, without the shim", async () => {
		const tempDir = realpathSync(
			mkdtempSync(join(tmpdir(), "pages-d1-shim-tests"))
		);
		const file = join(tempDir, "./d1-pages.js");

		execSync(
			`npx wrangler pages functions build --outfile ${file} --bindings="{\\"d1_databases\\":{\\"FOO\\":{}}}"`,
			{
				cwd: path.resolve(__dirname, ".."),
			}
		);

		expect(readFileSync(file, "utf-8")).not.toContain("D1_ERROR");
	});
});
