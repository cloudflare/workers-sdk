import { logger } from "../logger";
import type { AutoConfigDetails } from "./types";

export async function getDetailsForAutoConfig(options?: {
	projectPath?: string; // the path to the project, defaults to cwd
}): Promise<AutoConfigDetails> {
	logger.debug(
		`Running autoconfig detection in ${options?.projectPath ?? process.cwd()}...`
	);
	return { configured: true };
}
