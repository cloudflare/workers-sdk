import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { it } from "vitest";
import { checkPublishedTypes } from "../../../../tools/test/published-types";

const packageRoot = fileURLToPath(new URL("../../", import.meta.url));

runInTempDir();

it("loads the built CLI and experimental config entry points", ({ expect }) => {
	const output = execFileSync(
		process.execPath,
		[
			"--input-type=module",
			"-e",
			`const api = await import(${JSON.stringify(new URL("../../wrangler-dist/cli.js", import.meta.url).href)});
const config = await import(${JSON.stringify(new URL("../../wrangler-dist/experimental-config.mjs", import.meta.url).href)});
console.log(typeof api.getPlatformProxy, typeof config.defineWranglerConfig);`,
		],
		{ encoding: "utf8", timeout: 30_000 }
	);
	expect(output.trim()).toBe("function function");
});

it("publishes declarations that resolve without workspace devDependencies", ({
	expect,
}) => {
	expect(
		checkPublishedTypes(
			packageRoot,
			"wrangler-dist",
			`import { getPlatformProxy } from "wrangler";
import { defineWranglerConfig } from "wrangler/experimental-config";
defineWranglerConfig({});
void getPlatformProxy;`
		)
	).toEqual([]);
});
