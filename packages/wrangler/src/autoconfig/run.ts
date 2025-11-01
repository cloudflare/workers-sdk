import { logger } from "../logger";
import type { AutoConfigDetails } from "./types";

export async function runAutoConfig(
	autoConfigDetails: AutoConfigDetails
): Promise<void> {
	logger.debug(
		`Running autoconfig with:\n${JSON.stringify(autoConfigDetails, null, 2)}...`
	);
	return;
}
