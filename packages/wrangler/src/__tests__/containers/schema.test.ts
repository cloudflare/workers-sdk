import fs from "node:fs";
import path from "node:path";
import { describe, it } from "vitest";

type WranglerSchema = {
	definitions: {
		ContainerApp: {
			properties: Record<string, unknown>;
			required?: string[];
		};
		DurableObjectExport: {
			anyOf: {
				properties: Record<string, unknown> & {
					container?: {
						anyOf?: {
							type?: string;
							$ref?: string;
						}[];
					};
				};
				required?: string[];
			}[];
		};
		ContainerInstanceGroupConfig: {
			properties: Record<string, unknown> & {
				images: {
					type: string;
					items: {
						$ref: string;
					};
				};
			};
			required?: string[];
		};
		ContainerInstanceGroupImage: {
			properties: Record<string, unknown>;
			required: string[];
		};
		RawConfig: {
			properties: {
				build: {
					description: string;
					markdownDescription?: string;
				};
			};
		};
	};
};

function readSchema(): WranglerSchema {
	const schemaFile = path.join(__dirname, "../../../config-schema.json");
	return JSON.parse(fs.readFileSync(schemaFile, "utf-8")) as WranglerSchema;
}

describe("config schema", () => {
	it("documents ssh without exposing wrangler_ssh", ({ expect }) => {
		const schema = readSchema();

		expect(schema.definitions.ContainerApp.properties).toHaveProperty("ssh");
		expect(schema.definitions.ContainerApp.properties).not.toHaveProperty(
			"wrangler_ssh"
		);
	});

	it("does not require class_name, since a container may be referenced from `exports`", ({
		expect,
	}) => {
		const schema = readSchema();

		expect(schema.definitions.ContainerApp.properties).toHaveProperty(
			"class_name"
		);
		expect(schema.definitions.ContainerApp.required).not.toContain(
			"class_name"
		);
	});

	it("allows `container` on live durable object exports only", ({ expect }) => {
		const schema = readSchema();
		const branchesWithContainer = schema.definitions.DurableObjectExport.anyOf
			.filter((branch) => "container" in branch.properties)
			.map((branch) => branch.required);

		// The two live states: `created` (the default) and `expecting-transfer`.
		expect(branchesWithContainer).toEqual([
			["type", "storage"],
			["type", "state", "storage", "transfer_from"],
		]);
	});

	it("documents Container Instance Groups on Durable Object exports", ({
		expect,
	}) => {
		const schema = readSchema();
		const instanceGroup = schema.definitions.ContainerInstanceGroupConfig;

		expect(instanceGroup.required).toBeUndefined();
		expect(Object.keys(instanceGroup.properties)).toEqual(["images"]);
		expect(instanceGroup.properties.images).toEqual(
			expect.objectContaining({
				type: "array",
				items: {
					$ref: "#/definitions/ContainerInstanceGroupImage",
				},
			})
		);

		const image = schema.definitions.ContainerInstanceGroupImage;
		expect(image.required).toEqual(["binding", "image"]);
		expect(Object.keys(image.properties)).toEqual(["binding", "image"]);

		const containerSchema = schema.definitions.DurableObjectExport.anyOf.find(
			(branch) => branch.properties.container !== undefined
		)?.properties.container;
		expect(containerSchema?.anyOf).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ type: "string" }),
				expect.objectContaining({
					$ref: "#/definitions/ContainerInstanceGroupConfig",
				}),
			])
		);
	});

	it("emits markdownDescription for rich editor hovers", ({ expect }) => {
		const schema = readSchema();
		const build = schema.definitions.RawConfig.properties.build;

		expect(build.description).toContain(
			"[custom builds documentation](https://developers.cloudflare.com/workers/cli-wrangler/configuration#build)"
		);
		expect(build.markdownDescription).toContain(
			"[custom builds documentation](https://developers.cloudflare.com/workers/cli-wrangler/configuration#build)"
		);
	});
});
