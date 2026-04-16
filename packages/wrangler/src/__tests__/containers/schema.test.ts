import fs from "node:fs";
import path from "node:path";
import { describe, it } from "vitest";

describe("containers config schema", () => {
	it("documents ssh without exposing wrangler_ssh", ({ expect }) => {
		const schemaFile = path.join(__dirname, "../../../config-schema.json");
		const schema = JSON.parse(fs.readFileSync(schemaFile, "utf-8")) as {
			definitions: {
				ContainerApp: {
					properties: Record<string, unknown>;
				};
			};
		};

		expect(schema.definitions.ContainerApp.properties).toHaveProperty("ssh");
		expect(schema.definitions.ContainerApp.properties).not.toHaveProperty(
			"wrangler_ssh"
		);
	});
});
