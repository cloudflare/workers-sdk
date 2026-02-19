import * as fs from "node:fs";
import * as path from "node:path";
import { test } from "vitest";
import { getTextResponse, isBuild, testDir } from "../../__test-utils__";

test.runIf(!isBuild)(
	"can import module from child environment",
	async ({ expect }) => {
		const response = await getTextResponse();
		expect(response).toBe("Hello from the child environment");
	}
);

test.runIf(isBuild)(
	"nests child environment output in parent environment output directory",
	({ expect }) => {
		const childEnvironmentEntryPath = path.join(
			testDir,
			"dist/parent/child/child-environment-module.js"
		);

		expect(fs.existsSync(childEnvironmentEntryPath)).toBe(true);
	}
);
