import { describe, it } from "vitest";
import {
	addMigrationTodos,
	renderCloudflareConfig,
	renderWranglerConfig,
} from "../../src/cloudflare-config/render";
import { createFollowUp } from "../../src/follow-ups";
import type { ConvertedWranglerConfig } from "../../src/wrangler-config/types";

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
	it.for([
		["with", [createFollowUp("missing-name", "Settings TODO.")]],
		["without", []],
	] as const)(
		"adds TODOs to a file %s a TODO list as if rendered together",
		([, existingFollowUps], { expect }) => {
			const addedFollowUps = [
				createFollowUp("vite-tooling-config", "Build TODO with $&.", {
					sourcePath: "dev",
				}),
				createFollowUp("vite-source-maps", "Guidance.", { blocking: false }),
			];
			const written = createConvertedConfig();
			written.followUps = [...existingFollowUps];
			const together = createConvertedConfig();
			together.followUps = [...existingFollowUps, ...addedFollowUps];

			expect(
				addMigrationTodos(renderCloudflareConfig(written), addedFollowUps)
			).toBe(renderCloudflareConfig(together));
		}
	);

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
