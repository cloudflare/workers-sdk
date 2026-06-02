import { UserError } from "@cloudflare/workers-utils";
import { promptForExplicitYes } from "../dialogs";
import { isNonInteractiveOrCI } from "../is-interactive";
import { logger } from "../logger";

export const TEMPORARY_TERMS_PROMPT =
	'You must accept Cloudflare\'s Terms of Service (https://www.cloudflare.com/website-terms/) and Privacy Policy (https://www.cloudflare.com/privacypolicy/) in order to continue. By typing "yes", you agree to these terms. Type "yes" to continue.';
export const TEMPORARY_TERMS_NOTICE =
	"Continuing means you accept Cloudflare's Terms of Service (https://www.cloudflare.com/website-terms/) and Privacy Policy (https://www.cloudflare.com/privacypolicy/).";

const TEMPORARY_TERMS_ERROR =
	"You must accept Cloudflare's Terms of Service (https://www.cloudflare.com/website-terms/) and Privacy Policy (https://www.cloudflare.com/privacypolicy/) to use --temporary.";

export async function ensureTemporaryTermsAccepted(): Promise<void> {
	if (isNonInteractiveOrCI()) {
		logger.log(TEMPORARY_TERMS_NOTICE);
		return;
	}

	if (await promptForExplicitYes(TEMPORARY_TERMS_PROMPT)) {
		return;
	}

	throw new UserError(TEMPORARY_TERMS_ERROR, {
		telemetryMessage: "user temporary terms not accepted",
	});
}
