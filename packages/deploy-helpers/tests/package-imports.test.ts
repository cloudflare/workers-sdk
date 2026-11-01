import { execFileSync } from "node:child_process";
import path from "node:path";
import { expectTypeOf, it } from "vitest";
import type {
	getNodeCompat,
	NodeJSCompatMode,
} from "@cloudflare/workers-utils/node-compat";
import type { getFreshSourceMapSupport } from "@cloudflare/workers-utils/sourcemap";

it("preserves the public types of the shared utility entry points", () => {
	expectTypeOf<typeof getFreshSourceMapSupport>().returns.toEqualTypeOf<
		typeof import("@cspotcode/source-map-support")
	>();
	expectTypeOf<
		ReturnType<typeof getNodeCompat>["mode"]
	>().toEqualTypeOf<NodeJSCompatMode>();
});

it("imports the built package and uses its utilities without loading the runtime", ({
	expect,
}) => {
	const output = execFileSync(
		process.execPath,
		[
			"--input-type=module",
			"-e",
			`
		import assert from "node:assert/strict";
		import { registerHooks } from "node:module";
		registerHooks({
			resolve(specifier, context, nextResolve) {
				if (specifier === "miniflare" || specifier === "workerd" || specifier.startsWith("workerd/")) {
					throw new Error("Unexpected runtime import: " + specifier);
				}
				return nextResolve(specifier, context);
			},
		});
		const helpers = await import("@cloudflare/deploy-helpers");
		assert.equal(helpers.validateNodeCompatMode("2026-08-04", [], {}), "v2");
		assert.equal(helpers.getSourceMappedString("Error: example"), "Error: example");
		await assert.rejects(import("@cloudflare/deploy-helpers/startup-profile"), /Unexpected runtime import: miniflare/);
		console.log("ok");
	`,
		],
		{
			cwd: path.resolve(import.meta.dirname, ".."),
			encoding: "utf8",
		}
	);
	expect(output.trim()).toBe("ok");
});
