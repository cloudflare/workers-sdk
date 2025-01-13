import TOML from "@iarna/toml";
import { configFileName } from "../config";
import { UserError } from "../errors";
import { logger } from "../logger";
import type { Config } from "../config";

export function getRules(config: Config): Config["rules"] {
	const rules = config.rules ?? config.build?.upload?.rules ?? [];

	if (config.rules && config.build?.upload?.rules) {
		throw new UserError(
			`You cannot configure both [rules] and [build.upload.rules] in your ${configFileName(config.configPath)} file. Delete the \`build.upload\` section.`
		);
	}

	if (config.build?.upload?.rules) {
		logger.warn(
			`Deprecation: The \`build.upload.rules\` config field is no longer used, the rules should be specified via the \`rules\` config field. Delete the \`build.upload\` field from the configuration file, and add this:

${TOML.stringify({ rules: config.build.upload.rules })}`
		);
	}
	return rules;
}
