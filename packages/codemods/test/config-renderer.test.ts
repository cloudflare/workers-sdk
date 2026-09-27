import { describe, it } from "vitest";
import {
	renderCloudflareConfig,
	renderWranglerConfig,
} from "../src/codemods/wrangler-to-cf/config-renderer";
import type { ConvertedWranglerConfig } from "../src/codemods/wrangler-to-cf/types";

function createConvertedConfig(): ConvertedWranglerConfig {
	return {
		base: {
			config: {
				kind: "object",
				properties: [
					{
						key: "worker",
						value: {
							kind: "object",
							properties: [{ key: "name", value: "example" }],
						},
					},
				],
			},
		},
		environments: new Map(),
		followUps: [],
		imports: new Set(),
		toolingEnvironments: new Map(),
	};
}

describe("configuration rendering", () => {
	it("renders a static Cloudflare configuration", ({ expect }) => {
		expect(renderCloudflareConfig(createConvertedConfig())).toBe(
			'import { defineConfig } from "cf/config";\n\n' +
				'export default defineConfig({\n\tworker: {\n\t\tname: "example",\n\t},\n});\n'
		);
	});

	it("renders environment and preview branches", ({ expect }) => {
		const converted = createConvertedConfig();
		converted.base.previewConfig = {
			kind: "object",
			properties: [
				{ key: "worker", value: { kind: "object", properties: [] } },
			],
		};
		converted.environments.set("staging", converted.base);

		expect(renderCloudflareConfig(converted)).toContain("switch (ctx.mode)");
		expect(renderCloudflareConfig(converted)).toContain("if (ctx.isPreview)");
	});

	it("renders Wrangler tooling only when configured", ({ expect }) => {
		const converted = createConvertedConfig();
		expect(renderWranglerConfig(converted)).toBeNull();

		converted.toolingBase = {
			config: {
				kind: "object",
				properties: [{ key: "minify", value: true }],
			},
		};
		expect(renderWranglerConfig(converted)).toContain(
			"defineWranglerConfig({\n\tminify: true,\n})"
		);
	});
});
