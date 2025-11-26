import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { createGenerator } from "ts-json-schema-generator";
import type { Config, Schema } from "ts-json-schema-generator";

const config: Config = {
	path: join(__dirname, "../../workers-utils/src/config/config.ts"),
	tsconfig: join(__dirname, "../../workers-utils/tsconfig.json"),
	type: "RawConfig",
	skipTypeCheck: true,
};

const applyFormattingRules = (schema: Schema) => {
	return { ...schema, allowTrailingCommas: true };
};

const schema = applyFormattingRules(
	createGenerator(config).createSchema(config.type)
);

writeFileSync(
	join(__dirname, "../config-schema.json"),
	JSON.stringify(schema, null, 2)
);
