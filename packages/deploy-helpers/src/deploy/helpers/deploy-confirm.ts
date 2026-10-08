import { isNonInteractiveOrCI } from "@cloudflare/workers-utils";
import { confirm, logger } from "../../shared/context";

export function getDeployConfirmFunction(options: {
	strictMode?: boolean;
	strictModeAbortMessage?: string;
}): (text: string) => Promise<boolean> {
	const {
		strictMode = false,
		strictModeAbortMessage = "Aborting the upload operation because of conflicts. To override and upload anyway, remove the `--strict` flag",
	} = options;
	const nonInteractive = isNonInteractiveOrCI();

	if (nonInteractive && strictMode) {
		return async () => {
			logger.error(strictModeAbortMessage);
			process.exitCode = 1;
			return false;
		};
	} else if (nonInteractive) {
		// if its not in strict mode, continue without asking
		return async () => true;
	}

	return confirm;
}
