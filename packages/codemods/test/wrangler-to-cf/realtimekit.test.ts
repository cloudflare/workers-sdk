import { describe, it } from "vitest";
import { convertWranglerConfig } from "../../src/codemods/wrangler-to-cf/config-converter";
import { renderCloudflareConfig } from "../../src/codemods/wrangler-to-cf/config-renderer";

const baseConfig = {
	name: "meetings",
	compatibility_date: "2026-01-01",
	realtimekit: [{ binding: "RTK", app_id: "production-app", remote: true }],
} as const;

describe("RealtimeKit migration", () => {
	it("migrates app IDs and remote opt-in", ({ expect }) => {
		const converted = convertWranglerConfig(
			{ ...baseConfig, realtimekit: [...baseConfig.realtimekit] },
			"wrangler",
			[]
		);
		const source = renderCloudflareConfig(converted);
		expect(source).toContain("RTK: bindings.realtimekit(");
		expect(source).toContain('id: "production-app"');
		expect(source).toContain("remote: true");
	});

	it("recognizes RealtimeKit as a supported configuration field", ({
		expect,
	}) => {
		const converted = convertWranglerConfig(
			{ ...baseConfig, realtimekit: [...baseConfig.realtimekit] },
			"wrangler",
			[]
		);
		expect(
			converted.followUps.filter(({ code }) => code === "unsupported-field")
		).toEqual([]);
	});

	it("does not copy production app bindings into named environments", ({
		expect,
	}) => {
		const converted = convertWranglerConfig(
			{
				...baseConfig,
				realtimekit: [...baseConfig.realtimekit],
				env: { staging: {} },
			},
			"wrangler",
			[]
		);
		expect(converted.environments.get("staging")?.config).toBeDefined();
		expect(
			JSON.stringify(converted.environments.get("staging")?.config)
		).not.toContain("production-app");
	});

	it("does not copy production app bindings into Previews", ({ expect }) => {
		const converted = convertWranglerConfig(
			{
				...baseConfig,
				realtimekit: [...baseConfig.realtimekit],
				previews: { vars: { MODE: "preview" } },
			},
			"wrangler",
			[]
		);
		expect(converted.base.previewConfig).toBeDefined();
		expect(JSON.stringify(converted.base.previewConfig)).not.toContain(
			"production-app"
		);
	});
});
