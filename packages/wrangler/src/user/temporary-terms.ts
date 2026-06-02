import { UserError } from "@cloudflare/workers-utils";
import { promptForExplicitYes } from "../dialogs";
import { isNonInteractiveOrCI } from "../is-interactive";
import { logger } from "../logger";

export const TEMPORARY_TERMS_PROMPT =
	'Before continuing with --temporary, you must accept Cloudflare\'s Terms of Service (https://www.cloudflare.com/website-terms/) and Privacy Policy (https://www.cloudflare.com/privacypolicy/). Anything you deploy with --temporary is temporary and may expire unless you claim it before it expires. By typing "yes", you agree to these terms. Type "yes" to continue.';
export const TEMPORARY_TERMS_NOTICE =
	"Continuing with --temporary means you accept Cloudflare's Terms of Service (https://www.cloudflare.com/website-terms/) and Privacy Policy (https://www.cloudflare.com/privacypolicy/). Anything you deploy with --temporary is temporary and may expire unless you claim it before it expires.";

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
