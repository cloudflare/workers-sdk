import * as path from "path";
import { Diagnostics } from "../../config/diagnostics";
import { isBoolean, isString, isStringArray } from '../../config/validation-helpers';
import { isValidName, validateVars } from "./validation-helpers";
import type { PagesConfig, RawPagesConfig } from "./config";

export function normalizeAndValidatePagesConfig(
	rawConfig: RawPagesConfig,
	configPath: string | undefined,
	args: unknown
): {
	config: PagesConfig;
	diagnostics: Diagnostics;
} {
	// TODO: Combine config + args

	const diagnostics = new Diagnostics(
		`Processing ${
			configPath ? path.relative(process.cwd(), configPath) : "pages"
		} configuration:`
	);

	isValidName(diagnostics, "name", rawConfig.name, undefined);

	// todo: check for hex string here
	isString(diagnostics, "account_id", rawConfig.account_id, undefined);

	isString(diagnostics, "output_directory", rawConfig.output_directory, undefined);

	if (rawConfig.compatibility_date) {
		if (typeof rawConfig.compatibility_date === 'string') {
			isString(diagnostics, "compatibility_date", rawConfig.compatibility_date, undefined);
		} else {
			isString(diagnostics, "compatibility_date.build_image", rawConfig.compatibility_date.build_image, undefined);
			isString(diagnostics, "compatibility_date.runtime", rawConfig.compatibility_date.runtime, undefined);
		}
	}

	isStringArray(diagnostics, "compatibilty_flags", rawConfig.compatibility_flags, undefined);

	isBoolean(diagnostics, "node_compat", rawConfig.node_compat, undefined);

	validateVars(diagnostics, "vars", rawConfig.vars, undefined);

	// @ts-expect-error make this work, walshy!
	return { config: rawConfig, diagnostics };
}
