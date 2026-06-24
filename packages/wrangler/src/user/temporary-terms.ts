import { prompt } from "../dialogs";
import { isNonInteractiveOrCI } from "../is-interactive";
import { logger } from "../logger";

export async function ensureTemporaryTermsAccepted(
	question: string,
	notice: string
): Promise<boolean> {
	if (isNonInteractiveOrCI()) {
		logger.log(notice);
		return true;
	}

	const answer = await prompt(question);
	if (typeof answer === "string" && answer.trim().toLowerCase() === "yes") {
		return true;
	}

	return false;
}
