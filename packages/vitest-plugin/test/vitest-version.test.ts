import path from "node:path";
import { runInTempDir, seed } from "@cloudflare/workers-utils/test-helpers";
import { describe, it } from "vitest";
import { assertCompatibleVitestVersion } from "../src/pool/index";
import type { Vitest } from "vitest/node";

describe("assertCompatibleVitestVersion", () => {
	runInTempDir();

	it.for(["3.2.4", "4.1.11"])(
		"rejects Vitest %s",
		async (version, { expect }) => {
			await seed({
				"package.json": JSON.stringify({ name: "vitest", version }),
			});
			const ctx = { distPath: path.resolve("dist") } as Vitest;

			expect(() => assertCompatibleVitestVersion(ctx)).toThrow(
				`You're running \`vitest@${version}\`, but this version of \`@cloudflare/vitest-plugin\` only supports \`vitest ^5.0.0\`.`
			);
		}
	);

	it("accepts Vitest 5", async ({ expect }) => {
		await seed({
			"package.json": JSON.stringify({ name: "vitest", version: "5.0.0" }),
		});
		const ctx = { distPath: path.resolve("dist") } as Vitest;

		expect(() => assertCompatibleVitestVersion(ctx)).not.toThrow();
	});
});
