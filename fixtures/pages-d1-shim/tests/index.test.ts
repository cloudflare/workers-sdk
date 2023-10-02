import { execSync } from "child_process";
import { mkdtempSync, readFileSync, realpathSync } from "fs";
import { tmpdir } from "os";
import * as path from "path";
import { join } from "path";
import { describe, it } from "vitest";

describe("Pages D1 shim", () => {
	it("builds functions with D1 binding, without the shim", async ({
		expect,
	}) => {
		const dir = getTmpDir();
		const file = join(dir, "./d1-pages.js");

		execSync(
			`npx wrangler pages functions build --outfile ${file} --bindings="{\\"d1_databases\\":{\\"FOO\\":{}}}"`,
			{
				cwd: path.resolve(__dirname, ".."),
			}
		);

		expect(readFileSync(file, "utf-8")).not.toContain("D1_ERROR");
	});
});

function getTmpDir() {
	return realpathSync(mkdtempSync(path.join(tmpdir(), "d1-pages-tests-")));
}
