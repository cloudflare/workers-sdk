import { UserError } from "@cloudflare/workers-utils";
import { promptForExplicitYes } from "../dialogs";

export const TEMPORARY_TERMS_PROMPT =
	'Before continuing with --temporary, you must accept Cloudflare\'s Terms of Service (https://www.cloudflare.com/website-terms/) and Privacy Policy (https://www.cloudflare.com/privacypolicy/). Anything you deploy with --temporary is temporary and may expire unless you claim it before it expires. By typing "yes", you agree to these terms. Type "yes" to continue.';

export async function ensureTemporaryTermsAccepted(): Promise<void> {
	if (await promptForExplicitYes(TEMPORARY_TERMS_PROMPT)) {
		return;
	}

	throw new UserError(
		"You must accept Cloudflare's Terms of Service and Privacy Policy to use --temporary.",
		{ telemetryMessage: "user temporary terms not accepted" }
	);
}
