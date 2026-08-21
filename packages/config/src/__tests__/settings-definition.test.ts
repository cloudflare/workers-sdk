import { describe, it } from "vitest";
import { DEFINITION, resolveExportDefinition } from "../definition";
import { defineSettings } from "../settings-definition";

describe("defineSettings", () => {
	it("stores the authored config under the DEFINITION symbol", ({ expect }) => {
		const settings = defineSettings({ accountId: "acc-123" });

		expect(settings[DEFINITION]).toEqual({
			config: { accountId: "acc-123" },
			type: "settings",
		});
	});

	it("resolves to a settings config", async ({ expect }) => {
		const settings = defineSettings({ complianceRegion: "fedramp-high" });

		await expect(
			resolveExportDefinition(settings, { mode: undefined })
		).resolves.toEqual({
			type: "settings",
			complianceRegion: "fedramp-high",
		});
	});

	it("resolves a function config with the config context", async ({
		expect,
	}) => {
		const settings = defineSettings((ctx) => ({
			complianceRegion:
				ctx.mode === "production"
					? ("fedramp-high" as const)
					: ("public" as const),
		}));

		await expect(
			resolveExportDefinition(settings, { mode: "production" })
		).resolves.toEqual({
			type: "settings",
			complianceRegion: "fedramp-high",
		});
	});
});
