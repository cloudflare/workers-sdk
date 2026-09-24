import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, it } from "vitest";
import { KNOWN_FIELDS } from "../../src/codemods/wrangler-to-cf/config-converter";

interface WranglerSchema {
	definitions?: {
		RawConfig?: {
			properties?: Record<string, unknown>;
		};
	};
}

describe("Wrangler schema coverage", () => {
	it("classifies every top-level Wrangler configuration field", async ({
		expect,
	}) => {
		const schemaPath = path.join(
			__dirname,
			"../../../wrangler/config-schema.json"
		);

		await expect(access(schemaPath)).resolves.toBeUndefined();

		const schema = JSON.parse(
			await readFile(schemaPath, "utf8")
		) as WranglerSchema;
		const schemaFields = Object.keys(
			schema.definitions?.RawConfig?.properties ?? {}
		).sort();

		expect(Array.from(KNOWN_FIELDS).sort()).toEqual(schemaFields);
	});
});
