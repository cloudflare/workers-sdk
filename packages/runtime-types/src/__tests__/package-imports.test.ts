import { execFileSync } from "node:child_process";
import module from "node:module";
import path from "node:path";
import { it } from "vitest";

// Synchronous module hooks were added after the minimum supported Node version.
it.skipIf(typeof module.registerHooks !== "function")(
	"imports the built package without loading the runtime",
	({ expect }) => {
		const script = `
		import assert from "node:assert/strict";
		import { registerHooks } from "node:module";
		registerHooks({
			resolve(specifier, context, nextResolve) {
				if (specifier === "miniflare" || specifier.startsWith("miniflare/") || specifier === "workerd" || specifier.startsWith("workerd/")) {
					throw new Error("Unexpected runtime import: " + specifier);
				}
				return nextResolve(specifier, context);
			},
		});
		const { getRuntimeHeader, generateRuntimeTypes, RUNTIME_HEADER_COMMENT_PREFIX, RUNTIME_TYPES_MARKER } = await import("@cloudflare/runtime-types");
		assert.equal(getRuntimeHeader("test-version", "2024-11-06"), RUNTIME_HEADER_COMMENT_PREFIX + "test-version 2024-11-06");
		assert.equal(RUNTIME_TYPES_MARKER, "// Begin runtime types");
		await assert.rejects(generateRuntimeTypes({ compatibilityDate: "2024-11-06" }), /Unexpected runtime import: workerd/);
		console.log("ok");
	`;
		const output = execFileSync(
			process.execPath,
			["--input-type=module", "--eval", script],
			{
				cwd: path.resolve(import.meta.dirname, "../.."),
				encoding: "utf8",
				timeout: 10_000,
			}
		);
		expect(output.trim()).toBe("ok");
	}
);
