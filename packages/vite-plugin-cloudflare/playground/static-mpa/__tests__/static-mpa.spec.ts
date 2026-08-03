import * as fs from "node:fs";
import * as path from "node:path";
import { test } from "vitest";
import { isBuild, rootDir } from "../../__test-utils__";
import "./base-tests";

test.runIf(isBuild)(
	"emits .assetsignore file in client output directory",
	({ expect }) => {
		expect(
			fs.readFileSync(path.join(rootDir, "dist", ".assetsignore"), "utf-8")
		).toBe(`wrangler.json\n.dev.vars\n`);
	}
);
