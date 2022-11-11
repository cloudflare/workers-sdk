import { execSync } from "child_process";
import { readFileSync } from "fs";
import { tmpdir } from "os";
import * as path from "path";
import { join } from "path";

describe("Pages Functions", () => {
	it("applies the d1 shim", async () => {
		const dir = tmpdir();
		const file = join(dir, "./d1-pages.js");

		execSync(
			`npx wrangler pages functions build --outfile ${file} --bindings="{\\"d1_databases\\":{\\"FOO\\":{}}}"`,
			{
				cwd: path.resolve(__dirname, "../"),
			}
		);

		expect(readFileSync(file, "utf-8")).toContain("D1_NORESULTS");
	});
});
