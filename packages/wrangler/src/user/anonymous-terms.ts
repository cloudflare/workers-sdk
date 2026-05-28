import { UserError } from "@cloudflare/workers-utils";
import { promptForExplicitYes } from "../dialogs";

export const ANONYMOUS_TERMS_PROMPT =
	'Before continuing with --allow-anonymous, you must accept Cloudflare\'s Terms of Service (https://www.cloudflare.com/website-terms/) and Privacy Policy (https://www.cloudflare.com/privacypolicy/). By typing "yes", you agree to these terms. Type "yes" to continue.';

export async function ensureAnonymousTermsAccepted(): Promise<void> {
	if (await promptForExplicitYes(ANONYMOUS_TERMS_PROMPT)) {
		return;
	}

	throw new UserError(
		"You must accept Cloudflare's Terms of Service and Privacy Policy to use --allow-anonymous.",
		{ telemetryMessage: "user anonymous terms not accepted" }
	);
}
