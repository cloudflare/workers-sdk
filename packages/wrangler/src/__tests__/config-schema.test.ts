import fs from "node:fs";
import path from "node:path";
import { describe, it } from "vitest";

type WranglerSchema = {
	$ref?: string;
	allOf?: { $ref: string }[];
	allowTrailingCommas?: boolean;
	definitions?: {
		DurableObjectMigration?: { properties?: Record<string, unknown> };
		ContainerApp?: {
			properties?: {
				images?: {
					additionalProperties?: { $ref?: string };
				};
				scheduling_policy?: {
					enum?: string[];
				};
			};
		};
		DurableObjectContainerImage?: {
			anyOf?: {
				properties?: Record<string, unknown>;
				required?: string[];
			}[];
		};
	};
};

function readSchema(): WranglerSchema {
	const schemaFile = path.join(__dirname, "../../config-schema.json");
	return JSON.parse(fs.readFileSync(schemaFile, "utf-8")) as WranglerSchema;
}

describe("config schema", () => {
	it("keeps allowTrailingCommas off the root $ref", ({ expect }) => {
		const schema = readSchema();

		// `allowTrailingCommas` is a VS Code extension to JSON Schema. In draft-07 a
		// `$ref` overrides its sibling keywords, so an editor resolving a root `$ref`
		// discards anything next to it — which would make every trailing comma in a
		// `wrangler.jsonc` report a spurious `jsonc(519)` warning. Keeping the
		// reference inside `allOf` leaves `allowTrailingCommas` on the root.
		expect(schema.allowTrailingCommas).toBe(true);
		expect(schema).not.toHaveProperty("$ref");
		expect(schema.allOf).toEqual([{ $ref: "#/definitions/RawConfig" }]);
	});

	it("describes every migration operation wrangler accepts", ({ expect }) => {
		const schema = readSchema();
		const migration = schema.definitions?.DurableObjectMigration;

		// The schema is generated from `DurableObjectMigration`, so anything missing
		// from that type is reported by editors as an unknown key, even though
		// `normalizeAndValidateConfig` accepts it and the deploy succeeds. All four
		// operations below are documented on the legacy class-migrations page.
		expect(Object.keys(migration?.properties ?? {})).toEqual(
			expect.arrayContaining([
				"new_classes",
				"new_sqlite_classes",
				"renamed_classes",
				"transferred_classes",
				"deleted_classes",
			])
		);
	});

	it("includes Durable Object-managed container configuration", ({
		expect,
	}) => {
		const schema = readSchema();
		const container = schema.definitions?.ContainerApp;
		const image = schema.definitions?.DurableObjectContainerImage;

		expect(container?.properties?.scheduling_policy?.enum).toContain(
			"durable_object"
		);
		expect(container?.properties?.images?.additionalProperties?.$ref).toBe(
			"#/definitions/DurableObjectContainerImage"
		);
		expect(image?.anyOf?.map((variant) => variant.required)).toEqual([
			["dockerfile"],
			["image"],
		]);
		const dockerfile = image?.anyOf?.find((variant) =>
			variant.required?.includes("dockerfile")
		);
		const registry = image?.anyOf?.find((variant) =>
			variant.required?.includes("image")
		);
		expect(dockerfile?.properties?.build_context).toMatchObject({
			type: "string",
		});
		expect(dockerfile?.properties?.build_vars).toMatchObject({
			type: "object",
			additionalProperties: { type: "string" },
		});
		expect(registry?.properties).not.toHaveProperty("build_context");
		expect(registry?.properties).not.toHaveProperty("build_vars");
	});
});
