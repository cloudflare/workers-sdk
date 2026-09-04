import fs from "node:fs";
import path from "node:path";
import { describe, it } from "vitest";

type WranglerSchema = {
	$ref?: string;
	allOf?: { $ref: string }[];
	allowTrailingCommas?: boolean;
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
});
