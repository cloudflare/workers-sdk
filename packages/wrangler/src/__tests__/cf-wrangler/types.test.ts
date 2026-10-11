import * as fs from "node:fs/promises";
import { runInTempDir, seed } from "@cloudflare/workers-utils/test-helpers";
import { describe, it, vi } from "vitest";
import { runCfWranglerTypes } from "../../cf-wrangler/types";

vi.mock("@cloudflare/config", async (importOriginal) => {
	const { createConfigMock } = await import("../helpers/mock-new-config");
	return createConfigMock(importOriginal);
});

describe("cf-wrangler types", () => {
	runInTempDir();

	it("generates types for the selected project mode", async ({ expect }) => {
		await seed({
			"cloudflare.config.ts": `export default ({ mode }) => ({
				worker: {
					name: mode === "preview" ? "preview-worker" : "default-worker",
					compatibilityDate: "2026-09-01",
				},
			});`,
		});

		expect(
			await runCfWranglerTypes({ mode: "preview", includeRuntime: false })
		).toBe(0);
		const content = await fs.readFile(".cloudflare/types/index.d.ts", "utf8");
		expect(content).toContain('import("cf/config").UnwrapConfig');
		expect(content).toContain('import("../../cloudflare.config").default');
	});
});
