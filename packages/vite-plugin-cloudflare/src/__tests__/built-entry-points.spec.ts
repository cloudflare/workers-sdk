import { fileURLToPath } from "node:url";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { it } from "vitest";
import { checkPublishedTypes } from "../../../../tools/test/published-types";

runInTempDir();

it("publishes declarations that resolve without workspace devDependencies", ({
	expect,
}) => {
	expect(
		checkPublishedTypes(
			fileURLToPath(new URL("../../", import.meta.url)),
			"dist",
			`import { cloudflare } from "@cloudflare/vite-plugin";
cloudflare();`
		)
	).toEqual([]);
});
