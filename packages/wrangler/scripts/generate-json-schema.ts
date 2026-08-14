import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { createGenerator } from "ts-json-schema-generator";
import type { Config, Schema } from "ts-json-schema-generator";

const config: Config = {
	path: join(__dirname, "../../workers-utils/src/config/config.ts"),
	tsconfig: join(__dirname, "../../workers-utils/tsconfig.json"),
	type: "RawConfig",
	skipTypeCheck: true,
	markdownDescription: true,
};

function applyFormattingRules({ $ref, ...schema }: Schema) {
	// `allowTrailingCommas` is a VS Code extension to JSON Schema. In draft-07 a
	// `$ref` overrides its sibling keywords, so editors discard `allowTrailingCommas`
	// when it sits next to the root `$ref`, and every trailing comma in a
	// `wrangler.jsonc` is reported as `jsonc(519)`. Moving the reference into an
	// `allOf` keeps both.
	return {
		...schema,
		allowTrailingCommas: true,
		...($ref === undefined ? {} : { allOf: [{ $ref }] }),
	};
}

const schema = applyFormattingRules(
	createGenerator(config).createSchema(config.type)
);

writeFileSync(
	join(__dirname, "../config-schema.json"),
	JSON.stringify(schema, null, 2)
);
