import { access } from "node:fs/promises";
import path from "node:path";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { describe, it } from "vitest";
import { writeMigrationOutputs } from "../../src/codemods/wrangler-to-cf/file-writer";

describe("writeMigrationOutputs", () => {
	runInTempDir();

	it("removes files created before a later write fails", async ({ expect }) => {
		const cloudflareConfigPath = path.join(
			process.cwd(),
			"cloudflare.config.ts"
		);
		const wranglerConfigPath = path.join(
			process.cwd(),
			"missing",
			"wrangler.config.ts"
		);

		await expect(
			writeMigrationOutputs(
				new Map([
					[cloudflareConfigPath, "export default {};\n"],
					[wranglerConfigPath, "export default {};\n"],
				])
			)
		).rejects.toMatchObject({ code: "ENOENT" });
		await expect(access(cloudflareConfigPath)).rejects.toMatchObject({
			code: "ENOENT",
		});
	});
});
