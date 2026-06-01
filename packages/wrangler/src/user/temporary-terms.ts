import { UserError } from "@cloudflare/workers-utils";
import { promptForExplicitYes } from "../dialogs";
import { isNonInteractiveOrCI } from "../is-interactive";

export const TEMPORARY_TERMS_PROMPT =
	'Before continuing with --temporary, you must accept Cloudflare\'s Terms of Service (https://www.cloudflare.com/website-terms/) and Privacy Policy (https://www.cloudflare.com/privacypolicy/). Anything you deploy with --temporary is temporary and may expire unless you claim it before it expires. By typing "yes", you agree to these terms. Type "yes" to continue.';

const TEMPORARY_TERMS_ERROR =
	"You must accept Cloudflare's Terms of Service (https://www.cloudflare.com/website-terms/) and Privacy Policy (https://www.cloudflare.com/privacypolicy/) to use --temporary.";

export async function ensureTemporaryTermsAccepted(): Promise<void> {
	if (isNonInteractiveOrCI()) {
		throw new UserError(
			`${TEMPORARY_TERMS_ERROR} Rerun this command in an interactive terminal and type "yes" when prompted.`,
			{
				telemetryMessage: "user temporary terms not accepted",
			}
		);
	}

	if (await promptForExplicitYes(TEMPORARY_TERMS_PROMPT)) {
		return;
	}

	throw new UserError(TEMPORARY_TERMS_ERROR, {
		telemetryMessage: "user temporary terms not accepted",
	});
}
