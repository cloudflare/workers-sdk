import { execFileSync } from "node:child_process";
import path from "node:path";
import * as helpers from "@cloudflare/deploy-helpers";
import { deploy } from "@cloudflare/deploy-helpers/deploy";
import { previewBuildOutput } from "@cloudflare/deploy-helpers/preview";
import { triggersDeploy } from "@cloudflare/deploy-helpers/triggers";
import { versionsUpload } from "@cloudflare/deploy-helpers/versions-upload";
import { expectTypeOf, it } from "vitest";
import type {
	getNodeCompat,
	NodeJSCompatMode,
} from "@cloudflare/workers-utils/node-compat";
import type { getFreshSourceMapSupport } from "@cloudflare/workers-utils/sourcemap";

it("shares workflow implementations with the root entry point", ({
	expect,
}) => {
	expect(deploy).toBe(helpers.deploy);
	expect(versionsUpload).toBe(helpers.versionsUpload);
	expect(triggersDeploy).toBe(helpers.triggersDeploy);
	expect(previewBuildOutput).toBe(helpers.previewBuildOutput);
});

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
		for (const [entry, name] of [["deploy", "deploy"], ["versions-upload", "versionsUpload"], ["triggers", "triggersDeploy"], ["preview", "previewBuildOutput"]]) {
			const workflow = await import("@cloudflare/deploy-helpers/" + entry);
			assert.equal(workflow[name], helpers[name]);
		}
		const messages = [];
		const context = await import("@cloudflare/deploy-helpers/context");
		context.initDeployHelpersContext({ logger: { log: (message) => messages.push(message) } });
		const triggers = await import("@cloudflare/deploy-helpers/triggers");
		await triggers.triggersDeploy({ config: {}, validated: true, dryRun: true, scriptName: "test", routes: [], crons: [] });
		assert.deepEqual(messages, ["--dry-run: exiting now."]);
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
