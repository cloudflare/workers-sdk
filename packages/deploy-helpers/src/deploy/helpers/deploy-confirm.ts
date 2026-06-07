import { confirm, isNonInteractiveOrCI, logger } from "../../shared/context";

export function getDeployConfirmFunction(options: {
	strictMode?: boolean;
}): (text: string) => Promise<boolean> {
	const { strictMode = false } = options;
	const nonInteractive = isNonInteractiveOrCI();

	if (nonInteractive && strictMode) {
		return async () => {
			logger.error(
				"Aborting the deployment operation because of conflicts. To override and deploy anyway remove the `--strict` flag"
			);
			process.exitCode = 1;
			return false;
		};
	} else if (nonInteractive) {
		// if its not in strict mode, continue without asking
		return async () => true;
	}

	return confirm;
}
