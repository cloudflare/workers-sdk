import chalk from "chalk";
import { logger } from "../logger";

export function isLocal(
	args: {
		local?: boolean;
		remote?: boolean;
	},
	defaultValue = true
): boolean {
	if (args.local === undefined && args.remote === undefined) {
		return defaultValue;
	}
	return args.local === true || args.remote === false;
}

export function printResourceLocation(location: "remote" | "local") {
	logger.log(chalk.hex("#BD5B08").bold("Resource location:"), location, "\n");
}
