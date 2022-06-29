import * as path from "path";
import { Diagnostics } from "../../config/diagnostics";
import type { PagesConfig, RawPagesConfig } from "./config";
import { isValidName } from "./validation-helpers";

export function normalizeAndValidatePagesConfig(
	rawConfig: RawPagesConfig,
	configPath: string | undefined,
	args: unknown
): {
	config: PagesConfig;
	diagnostics: Diagnostics;
} {
	const diagnostics = new Diagnostics(
		`Processing ${
			configPath ? path.relative(process.cwd(), configPath) : "pages"
		} configuration:`
	);

	isValidName(diagnostics, "name", rawConfig.name, undefined);

	// @ts-expect-error make this work, walshy!
	return { config: rawConfig, diagnostics };
}
